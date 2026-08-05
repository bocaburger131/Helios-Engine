import pdfParse from 'pdf-parse';
import PDFParser from 'pdf2json';
import fs from 'fs/promises';
import logger from '../utils/logger.js';
import { logStructured } from '../utils/structuredLog.js';
import { PDFParseError } from '../utils/errors.js';
import { PerplexityService } from './perplexityService.js';
import { pickNumeric, hasValidAmountPattern, getAmountContext } from '../utils/financialValidation.js';
import { getAbsurdityThreshold } from '../utils/amountSanityGuardrails.js';
import { RTN_BANK_MAP, FDIC_CERT_MAP } from '../config/bankIdentifiers.js';
import { fuzzyMatch, normalizeAddress, normalizeCompanyName } from '../utils/stringUtils.js';
import { normalizeTransactionForLedger } from '../utils/transactionNormalization.js';
import {
  stitchStatement,
  mergePrintedTotals,
  isSummaryLedgerLine,
  RE_TRANSACTION_HISTORY,
  RE_PERIOD_SUMMARY_END_ANCHOR
} from './statementStitcher.js';
import { extractTransactionsFromPdfBuffer } from './extraction/pdfPlumberService.js';
import {
  dualEngineParseEnabled,
  applyDualEngineToParseResult
} from './extraction/dualEnginePdfParse.js';
import { resolveProfile } from './extraction/bankProfileRegistry.js';
import { runStatementExtractionPipeline } from './extraction/statementExtractionPipeline.js';
import { reconcileStatement } from './extraction/statementReconciliation.js';
import { tryRecoverChaseFromPlumber } from './extraction/profiles/chaseBusinessCompleteProfile.js';
import {
  extractSummary,
  normalizeSpaces,
  tryRecoverWellsNearMiss
} from './extraction/profiles/wellsFargoInitiateProfile.js';
import {
  extractTransactionRows,
  rowFallbackEnabled
} from './geminiVisionService.js';
import { setBatchProgress } from './batchProgressStore.js';
import { resolveRequiresBankConfirmation } from '../utils/bankConfirmationGate.js';
import { dedupeExactFingerprints } from '../utils/parseDiagnosticReport.js';
import { runLayoutFirstPipeline } from './extraction/layoutPipeline/layoutFirstOrchestrator.js';
import { comparePipelineShadow } from './extraction/layoutPipeline/pipelineShadowComparator.js';
import {
  layoutFirstShadowEnabled,
  layoutFirstPrimaryEnabled,
  layoutFirstVeraFallbackEnabled
} from './extraction/layoutPipeline/pipelineConfig.js';
import {
  shouldBlockLegacyExtract,
  logToxicFallbackBlocked
} from './extraction/layoutPipeline/toxicFallbackGuard.js';

function wellsFastGeminiEnabled() {
  const v = process.env.WELLS_INITIATE_FAST_GEMINI;
  if (v === 'false' || v === '0') return false;
  // Diagnostic AI Rescue replaces brute-force row extraction. While it is active
  // (default), skip the legacy Wells fast-Gemini row-extraction call site so we
  // never brute-force extract on a checksum miss. Opt back in explicitly via
  // AI_DIAGNOSTIC_RESCUE_ENABLED=false.
  const diag = process.env.AI_DIAGNOSTIC_RESCUE_ENABLED;
  if (!(diag === 'false' || diag === '0')) return false;
  return rowFallbackEnabled();
}

/** Keep unsigned amounts when type is unknown so balance inference can sign the row. */
function stageParsedTransaction(row) {
  if (!row || typeof row !== 'object') return row;
  if (row.type == null || row.type === undefined) {
    const amt = Number(row.amount);
    return {
      ...row,
      amount: Number.isFinite(amt) ? Math.round(amt * 100) / 100 : row.amount
    };
  }
  return normalizeTransactionForLedger(row);
}

/** Strong debit tokens when PDF omits minus signs or merges balance+amount columns (regional / WestStar-style). */
const RE_DEBIT_LINE_HINT =
  /\b(POS\s*DEBIT|ATM\s*(?:WITH|WTH|WITHDRAWAL)|\bDEBIT\b|WITHDRAWAL|CHECK\s*#\s*\d|ACH\s*DEB|ACH\s+D\s*DEB|ACH\s+DEBIT|PURCHASE\s+AUTHORIZED|ATM\s+WITHDRAWAL|BUSINESS\s+TO\s+BUSINESS\s+ACH\s+DEBIT|PAYMENT\s+TO|AUTOPAY|RECURRING\s+PAY|MAINTENANCE\s+FEE|MONTHLY\s+FEE|\bNSF\b|NSF\s+FEE|OVERDRAFT|RETURNED\s+ITEM|OD\s+FEE|PYMT\s+PROC|SHIFT4\s+FEES|TRANSFER\s+TO|ONLINE\s+TRANSFER\s+TO|RECURRING\s+DEBIT|BILL\s+PAY|ELECTRONIC\s+DEBIT|CARD\s+PURCHASE|ZELLE\s+PAYMENT|SERVICE\s+CHARGE|WIRE\s+TRANS?\s+FEE)\b/i;

/** Strong credit tokens; skipped when debit hint matches (debit wins). */
const RE_CREDIT_LINE_HINT =
  /\b(DIRECT\s*DEP|WIRE\s+IN|ACH\s*CREDIT|DEPOSIT\s+FROM|MOBILE\s+DEP|PAYROLL|REFUND|INTEREST\s+PAID|CREDIT\s+VIA|PYMT\s+PROC|SHIFT4\s+PYMT|TRANSFER\s+FROM|MERCHANT\s+DEP|DEPOSITED|INCOMING\s+WIRE)\b/i;

/** Summary / rollup rows that look like dated transactions but are period totals. */
const RE_SUMMARY_TOTAL_ROW =
  /\b(deposits?\s*(?:\/|and)\s*credits?|withdrawals?\s*(?:\/|and)\s*debits?|total\s+(?:deposits?|credits?|withdrawals?|debits?|electronic|checks?|fees?|service)|subtotal|daily\s+balance\s+summary)\b/i;

/** Regions / multi-table: each header re-opens parsing (do not permanently close). */
const RE_TXN_SECTION_START =
  /transaction\s+history|(?:credits?\s+and\s+debits?|debits?\s+and\s+credits?)\s*(?:\(continued\))?|electronic\s+deposits?(?:\s*[-/]\s*additions)?|electronic\s+credits?|electronic\s+withdrawals?|checks?\s*(?:paid|cleared)|check\s+card|bank\s+fees?|service\s+charges?|deposits?\s+and\s+(?:additions?|(?:other\s+)?credits?)|withdrawals?\s+and\s+(?:other\s+)?debits?|atm\s+(?:&|and)\s+debit|pos\s+debits?/i;

/** Subsection totals only — not the start of the next table. */
const RE_TXN_SUBSECTION_TOTAL =
  /^\s*total\s+(?:checks?|fees?|withdrawals?|deposits?|credits?|debits?|electronic|service)\b/i;

/** Wells Fargo: close activity parsing after transaction history block. */
const RE_WELLS_TXN_SECTION_END =
  /^(?:daily balance summary|interest summary|summary of account|account summary)\b/i;

/**
 * @param {string} line
 * @returns {boolean}
 */
export function isTransactionSectionHeader(line) {
  const trimmed = String(line || '').trim();
  if (/^\d{1,2}[-/]\d{1,2}/.test(trimmed)) return false;
  return RE_TXN_SECTION_START.test(trimmed);
}

export function lineHintsDebitForMergedPdf(line) {
  if (!line || typeof line !== 'string') return false;
  return RE_DEBIT_LINE_HINT.test(line);
}

export function lineHintsCreditForMergedPdf(line) {
  if (!line || typeof line !== 'string') return false;
  if (lineHintsDebitForMergedPdf(line)) return false;
  return RE_CREDIT_LINE_HINT.test(line);
}

/**
 * Infer debit vs credit from line text only (no default for unsigned positives).
 * @param {string} line
 * @param {number} amount
 * @returns {'debit'|'credit'|null}
 */
export function inferTransactionTypeFromLine(line, amount) {
  const text = String(line || '');
  const amt = Number(amount);
  if (Number.isFinite(amt) && amt < 0) return 'debit';
  if (lineHintsDebitForMergedPdf(text)) return 'debit';
  if (lineHintsCreditForMergedPdf(text)) return 'credit';
  if (
    /\b(deposit(?:ed)?|payroll|transfer\s+from|wire\s+in|incoming|mobile\s+dep|interest\s+paid|credit\s+via|refund|merchant\s+dep|online\s+transfer\s+from)\b/i.test(
      text
    )
  ) {
    return 'credit';
  }
  return null;
}

/**
 * When pdf-parse merges "running balance" and "amount" on one line, the first dollar
 * token is often the larger balance and the second is the transaction. Only when
 * debit/credit keywords disambiguate the row.
 */
function applyTwoColumnBalanceAmountSwap(line, matches, amount, balance) {
  if (!matches || matches.length !== 2 || amount === null) {
    return { amount, balance };
  }
  if (!lineHintsDebitForMergedPdf(line) && !lineHintsCreditForMergedPdf(line)) {
    return { amount, balance };
  }
  const a0 = PDFParserService._normalizeAmount(matches[0]);
  const a1 = PDFParserService._normalizeAmount(matches[1]);
  if (typeof a0 !== 'number' || typeof a1 !== 'number' || a0 <= 0 || a1 <= 0) {
    return { amount, balance };
  }
  if (a0 > a1) {
    return { amount: a1, balance: a0 };
  }
  return { amount, balance };
}

export class DocumentTriageError extends Error {
  constructor(message) {
    super(message);
    this.name = 'DocumentTriageError';
  }
}

export class PDFParserService {
  constructor() {
    this.bankParsers = new Map();
    this.perplexityService = new PerplexityService();
    this.initializeParsers();
  }

  async parsePDF(filePath, options = { bankType: 'DEFAULT', includeRawText: false }) {
    try {
      // Read the PDF file as buffer
      const buffer = await fs.readFile(filePath);
      return await this.parseStatement(buffer, options);
    } catch (error) {
      logger.error('PDF file reading failed:', error);
      throw new PDFParseError(`Failed to read PDF file: ${error.message}`);
    }
  }

  initializeParsers() {
    // Default parser for generic bank statements
    this.registerParser('DEFAULT', {
      parseDate: (text, context = {}) => {
        const datePattern = /(\d{1,2})[-/](\d{1,2})(?:[-/](\d{2,4}))?/;
        const match = text.match(datePattern);
        if (!match) return null;

        const [, monthStr, dayStr, yearStr] = match;
        const month = Number(monthStr);
        const day = Number(dayStr);
        const defaultYear = context.defaultYear ?? new Date().getFullYear();
        const year = yearStr ? Number(yearStr.length === 2 ? `20${yearStr}` : yearStr) : defaultYear;

        if (!Number.isFinite(month) || !Number.isFinite(day) || !Number.isFinite(year)) {
          return null;
        }

        const date = new Date(year, month - 1, day);
        return Number.isNaN(date.getTime()) ? null : date;
      },

      parseAmount: (text) => {
        const amountPattern = /(\(?-?\$?\s*[\d,]+\.\d{2}\)?)/;
        const match = text.match(amountPattern);
        if (!match) return null;

        // Use pickNumeric for validation
        return pickNumeric(match[1], {
          maxAmount: getAbsurdityThreshold(),
          allowNegative: true,
          strictDecimal: true
        });
      },

      parseDescription: (text) => {
        return text.replace(/(\d{1,2}[-/]\d{1,2}(?:[-/]\d{2,4})?)/g, '')
          .replace(/\(?-?\$?\s*[\d,]+\.\d{2}\)?/g, '')
          .replace(/\s{2,}/g, ' ')
          .trim();
      }
    });

    this.registerParser('TFS', {
      parseDate: (text, context = {}) => {
        const match = text.match(/(\d{2})-(\d{2})/);
        if (!match) return null;

        const [, monthStr, dayStr] = match;
        const month = Number(monthStr);
        const day = Number(dayStr);
        const defaultYear = context.defaultYear ?? new Date().getFullYear();

        if (!Number.isFinite(month) || !Number.isFinite(day)) return null;

        const date = new Date(defaultYear, month - 1, day);
        return Number.isNaN(date.getTime()) ? null : date;
      },

      parseAmount: (text) => {
        const matches = text.match(/\(?-?\$?\s*[\d,]+\.\d{2}\)?/g);
        if (!matches || matches.length === 0) return null;
        return pickNumeric(matches[0], {
          maxAmount: getAbsurdityThreshold(),
          allowNegative: true,
          strictDecimal: true
        });
      },

      parseDescription: (text) => {
        return text.replace(/\d{2}-\d{2}/g, '')
          .replace(/\(?-?\$?\s*[\d,]+\.\d{2}\)?/g, '')
          .replace(/\s{2,}/g, ' ')
          .trim();
      }
    });
  }

  registerParser(bankType, parser) {
    this.bankParsers.set(bankType.toUpperCase(), parser);
  }

  async parseStatement(buffer, options = { bankType: 'DEFAULT', includeRawText: false }) {
    const resolvedBankType = (options?.bankType || 'DEFAULT').toUpperCase();
    logger.info(`[PDF_PARSER] Starting parseStatement for bankType: ${resolvedBankType}`);

    try {
      if (resolvedBankType === 'TFS') {
        logger.info('[PDF_PARSER] Using TFS parser (pdf2json)');
        return await this._parseTfsWithPdf2Json(buffer, options);
      }

      // Default parsing logic for other bank types
      logger.info('[PDF_PARSER] Using default parser (pdf-parse)');
      const data = await pdfParse(buffer);
      logger.info('[PDF_PARSER] pdf-parse completed. Extracting data.');

      const anchorPayload = this._resolveAnchorOptions(options);

      // ── Phase 1: Deterministic document triage ────────────────────────────
      const headerWindow = this._getHeaderWindow(data.text, 1000);
      const indicators = this._detectBankStatementIndicators(headerWindow);

      let documentType = 'BANK_STATEMENT';
      let bankNameFromTriage = indicators.bankName;
      let bankNameConfidence = indicators.bankNameConfidence;
      let accountHolderName = null;
      let statementAddress = null;

      // ── Phase 1a: Identity Waterfall — RTN / FDIC / Anchor / Human ───────────
      const wfLogOpts = {
        suppressDetailLogs: Boolean(options?.suppressWaterfallDetailLogs),
        correlationId: options?.correlationId
      };
      const waterfallResult = this._resolveIdentityWaterfall(data.text, anchorPayload, wfLogOpts);
      if (waterfallResult.bankName) {
        bankNameFromTriage = waterfallResult.bankName;
        bankNameConfidence  = waterfallResult.confidence;
      }
      const identityMethod = waterfallResult.identityMethod;
      if (!wfLogOpts.suppressDetailLogs) {
        logStructured('info', '[PDF_PARSER] Identity Waterfall summary', {
          domain: 'parser-triage',
          identityMethod,
          method: identityMethod,
          bankName: waterfallResult.bankName || null,
          confidence: waterfallResult.confidence,
          rtn: waterfallResult.rtn ?? null,
          fdicCert: waterfallResult.fdicCert ?? null,
          anchorMatchedFields: waterfallResult.anchorMatchedFields ?? null,
          ...(options?.correlationId ? { correlationId: options.correlationId } : {})
        });
      }

      // ── Phase 1b: Deterministic finance application detection ─────────────
      if (!indicators.isStatement && this._detectFinanceApplicationIndicators(data.text)) {
        logger.info('[PDF_PARSER] Deterministic triage identified FINANCE_APPLICATION — rejecting immediately');
        throw new DocumentTriageError('Triaged Document: FINANCE_APPLICATION');
      }

      // ── Phase 2: AI fallback — only when deterministic scan fails ─────────
      if (!indicators.isStatement) {
        try {
          const triagePrompt =
            'Analyze this document text. Return a strict JSON object with these exact keys: ' +
            '"documentType" (must be exactly BANK_STATEMENT, GOV_ID, VOIDED_CHECK, CONTRACT, FINANCE_APPLICATION, or OTHER), ' +
            '"bankName" (string or null), ' +
            '"accountHolderName" (string or null), ' +
            'and "statementAddress" (string or null). ' +
            'Do not include markdown formatting or backticks in your response. ' +
            'Text to analyze: ' + headerWindow;

          const triageResponse = await this.perplexityService.analyzeText(triagePrompt);
          const triagePayload = this._extractObjectResponse(triageResponse);

          if (triagePayload && typeof triagePayload === 'object') {
            documentType = this._normalizeDocumentType(triagePayload.documentType) || documentType;
            if (triagePayload.bankName) {
              bankNameFromTriage = triagePayload.bankName;
              bankNameConfidence = 'HIGH'; // AI explicitly identified the bank
            }
            accountHolderName = triagePayload.accountHolderName || null;
            statementAddress = triagePayload.statementAddress || null;
          }
          logger.info(`[PDF_PARSER] AI triage result: documentType=${documentType}, bankName=${bankNameFromTriage}, confidence=${bankNameConfidence}`);
        } catch (triageErr) {
          logger.warn('[PDF_PARSER] AI triage failed — proceeding as BANK_STATEMENT', { error: triageErr.message });
        }
      } else {
        logger.info(`[PDF_PARSER] Deterministic triage confirmed BANK_STATEMENT (bankName=${bankNameFromTriage})`);
      }

      // ── Phase 3: Reject non-statement document types ──────────────────────
      const rejectTypes = new Set(['GOV_ID', 'VOIDED_CHECK', 'CONTRACT', 'FINANCE_APPLICATION', 'OTHER']);
      if (rejectTypes.has(documentType)) {
        throw new DocumentTriageError('Triaged Document: ' + documentType);
      }
      // ──────────────────────────────────────────────────────────────────────

      const defaultYear = this._detectStatementYear(data.text);
      const stitcher = stitchStatement(data.text);
      const accountInfo = await this._extractAccountInfo(data.text, resolvedBankType);
      logger.info('[PDF_PARSER] Extracted account info.');

      // Merge triage-detected bankName / accountNumber into accountInfo
      if (bankNameFromTriage && !accountInfo.bankName) {
        accountInfo.bankName = bankNameFromTriage;
      }
      if (indicators.accountNumber && !accountInfo.accountNumber) {
        accountInfo.accountNumber = indicators.accountNumber;
      }

      const profile = resolveProfile({
        text: data.text,
        rtn: waterfallResult.rtn ?? null,
        bankName: bankNameFromTriage || accountInfo.bankName,
        profileId: options?.bankProfileId
      });

      const plumberOptions = {
        fileName: options?.fileName,
        bankName: bankNameFromTriage || accountInfo.bankName || options?.bankName,
        defaultYear,
        explicitVerticalLines: options?.layoutTemplate?.explicitVerticalLines,
        explicitHorizontalLines: options?.layoutTemplate?.explicitHorizontalLines
      };
      let plumberResult = null;
      let plumberTransactions = null;
      if (dualEngineParseEnabled()) {
        plumberResult = await extractTransactionsFromPdfBuffer(buffer, plumberOptions);
        if (plumberResult?.success && plumberResult.transactions?.length) {
          plumberTransactions = plumberResult.transactions;
        }
      }

      let transactions = [];
      let pipelineResult = null;
      let wellsReconciliation = null;
      let balances = await this._extractBalances(data.text, resolvedBankType);

      try {
        const stitcherPrinted = mergePrintedTotals(
          stitcher.typeA?.printed ?? null,
          stitcher.typeA?.text || data.text
        );
        pipelineResult = await runStatementExtractionPipeline({
          text: data.text,
          altText: stitcher.typeB?.combinedText,
          profile,
          parserService: this,
          options,
          resolvedBankType,
          defaultYear,
          rtn: waterfallResult.rtn ?? null,
          accountNumber: accountInfo.accountNumber || indicators.accountNumber || null,
          plumberTransactions,
          plumberDroppedRows: plumberResult?.droppedRows || [],
          plumberUncertainAssignments: plumberResult?.uncertainAssignments || [],
          plumberRawWordRows: plumberResult?.rawWordRows || [],
          plumberMeta: {
            openingBalance: plumberResult?.openingBalance ?? null,
            closingBalance: plumberResult?.closingBalance ?? null,
          },
          stitcherPrinted,
          typeAText: stitcher.typeA?.text ?? null,
          pdfBuffer: buffer
        });
        transactions = pipelineResult.transactions || [];
        if (profile.id === 'wells_initiate_checking' || profile.id === 'chase_business_complete') {
          wellsReconciliation = pipelineResult.reconciliation ?? null;
        }
        if (pipelineResult.meta?.openingBalance != null) {
          balances.opening = pipelineResult.meta.openingBalance;
        }
        if (pipelineResult.meta?.closingBalance != null) {
          balances.closing = pipelineResult.meta.closingBalance;
        }
        if (pipelineResult.stitcherPrinted) {
          stitcher.typeA.printed = {
            ...stitcher.typeA.printed,
            ...pipelineResult.stitcherPrinted
          };
          if (pipelineResult.stitcherPrinted.opening != null) {
            balances.opening = pipelineResult.stitcherPrinted.opening;
          }
          if (pipelineResult.stitcherPrinted.closing != null) {
            balances.closing = pipelineResult.stitcherPrinted.closing;
          }
        }
        if (pipelineResult.stitcher) {
          Object.assign(stitcher, pipelineResult.stitcher);
        }
        const strictProfileIds = new Set(['wells_initiate_checking', 'chase_business_complete']);
        const rescueAttempted = pipelineResult.meta?.ocrRescueApplied === true || pipelineResult.meta?.ocrRescueFailed === true;
        const profileAccepted =
          !strictProfileIds.has(profile.id) ||
          (pipelineResult.extractionTier === 1 &&
            pipelineResult.reconciliation?.checksumOk === true) ||
          rescueAttempted;  // accept results that went through rescue chain even if checksum still fails

        if (!profileAccepted) {
          logger.warn('[PDF_PARSER] Profile pipeline not accepted — legacy transaction extract', {
            profileId: profile.id,
            checksumOk: pipelineResult.reconciliation?.checksumOk,
            extractionTier: pipelineResult.extractionTier
          });
          throw new Error(`${profile.id}_reconciliation_not_accepted`);
        }

        logger.info('[PDF_PARSER] Pipeline extracted transactions.', {
          profileId: pipelineResult.profileId,
          txnCount: transactions.length,
          checksumOk: pipelineResult.reconciliation?.checksumOk,
          extractionTier: pipelineResult.extractionTier
        });
      } catch (pipelineErr) {
        if (
          profile.id === 'wells_initiate_checking' &&
          pipelineErr?.name === 'WellsParseReconciliationError'
        ) {
          wellsReconciliation = pipelineErr.reconciliation ?? null;
          const wellsPartial = pipelineErr.partial ?? null;
          logger.warn('[WELLS_INITIATE] rejected — reconciliation failed', {
            parsedDeposits: wellsReconciliation?.parsedDeposits,
            printedDeposits: wellsReconciliation?.printedDeposits,
            parsedWithdrawals: wellsReconciliation?.parsedWithdrawals,
            printedWithdrawals: wellsReconciliation?.printedWithdrawals
          });

          const recovered = tryRecoverWellsNearMiss({
            reconciliation: wellsReconciliation,
            meta: wellsPartial?.meta,
            transactions: wellsPartial?.transactions,
            normalizedTransactions: wellsPartial?.normalizedTransactions
          });

          if (recovered?.transactions?.length) {
            transactions = recovered.transactions;
            wellsReconciliation = recovered.reconciliation;
            pipelineResult = {
              profileId: profile.id,
              extractionTier: recovered.checksumOk ? 1 : 2,
              reconciliation: recovered.reconciliation,
              dailyBalanceRule: { valid: true, violations: 0 },
              meta: { ...(recovered.meta || {}), extractionProfile: profile.id },
              normalizedTransactions: recovered.normalizedTransactions
            };
            if (recovered.meta?.openingBalance != null) {
              balances.opening = recovered.meta.openingBalance;
            }
            if (recovered.meta?.closingBalance != null) {
              balances.closing = recovered.meta.closingBalance;
            }
            logger.info('[PDF_PARSER] Wells near-miss recovery — using profile extract', {
              txnCount: transactions.length,
              checksumOk: recovered.checksumOk,
              nearMiss: recovered.nearMiss,
              beatsLegacy: recovered.beatsLegacy
            });
          }
        }
        if (
          profile.id === 'chase_business_complete' &&
          pipelineErr?.name === 'ChaseParseReconciliationError'
        ) {
          wellsReconciliation = pipelineErr.reconciliation ?? null;
          logger.warn('[CHASE_BUSINESS] rejected — reconciliation failed', {
            parsedDeposits: wellsReconciliation?.parsedDeposits,
            printedDeposits: wellsReconciliation?.printedDeposits,
            parsedWithdrawals: wellsReconciliation?.parsedWithdrawals,
            printedWithdrawals: wellsReconciliation?.printedWithdrawals
          });
        }

        if (profile.id === 'wells_initiate_checking' && wellsFastGeminiEnabled()) {
          try {
            logger.info('[PDF_PARSER] Wells fast Gemini row extraction', {
              fileName: options?.fileName,
              priorError: pipelineErr.message
            });
            const rowResult = await extractTransactionRows(buffer, {
              rtn: waterfallResult.rtn ?? undefined,
              bankName: bankNameFromTriage || accountInfo.bankName,
              printedOpeningBalance: balances.opening,
              printedClosingBalance: balances.closing,
              defaultYear,
              fileName: options?.fileName
            });
            const summary = extractSummary(normalizeSpaces(data.text));
            const meta = summary
              ? {
                  openingBalance: summary.openingBalance,
                  printedDeposits: summary.printedDeposits,
                  printedWithdrawals: summary.printedWithdrawals,
                  closingBalance: summary.closingBalance
                }
              : {};
            const reconciliation = reconcileStatement(meta, rowResult.transactions);
            wellsReconciliation = reconciliation;
            if (reconciliation.checksumOk) {
              transactions = rowResult.transactions;
              if (rowResult.openingBalance != null) balances.opening = rowResult.openingBalance;
              if (rowResult.closingBalance != null) balances.closing = rowResult.closingBalance;
              pipelineResult = {
                profileId: profile.id,
                extractionTier: 1,
                reconciliation,
                dailyBalanceRule: { valid: true, violations: 0 },
                meta: { ...meta, extractionProfile: profile.id }
              };
              logger.info('[PDF_PARSER] Wells fast Gemini accepted', {
                txnCount: transactions.length,
                checksumOk: true
              });
            } else {
              logger.warn('[PDF_PARSER] Wells fast Gemini checksum failed — legacy extract', {
                parsedDeposits: reconciliation.parsedDeposits,
                printedDeposits: reconciliation.printedDeposits
              });
            }
          } catch (geminiErr) {
            logger.warn('[PDF_PARSER] Wells fast Gemini failed', { error: geminiErr.message });
          }
        }

        if (pipelineResult?.extractionTier !== 1) {
          if (profile.id === 'chase_business_complete') {
            const plumberRaw =
              plumberResult?.transactions ??
              pipelineErr?.chasePlumberTransactions ??
              plumberTransactions;
            const recovered = tryRecoverChaseFromPlumber({
              plumberTransactions: plumberRaw,
              text: data.text,
              defaultYear,
              rtn: waterfallResult.rtn ?? null,
              accountNumber: accountInfo.accountNumber || indicators.accountNumber || null,
              stitcherPrinted: mergePrintedTotals(
                stitcher.typeA?.printed ?? null,
                stitcher.typeA?.text || data.text
              ),
              typeAText: stitcher.typeA?.text ?? null
            });
            if (recovered?.transactions?.length) {
              transactions = recovered.transactions;
              wellsReconciliation = recovered.reconciliation;
              pipelineResult = {
                profileId: profile.id,
                extractionTier: recovered.checksumOk ? 1 : 2,
                reconciliation: recovered.reconciliation,
                dailyBalanceRule: { valid: true, violations: 0 },
                meta: { ...recovered.meta, extractionProfile: profile.id },
                chasePlumberTransactions: recovered.transactions
              };
              if (recovered.meta.openingBalance != null) {
                balances.opening = recovered.meta.openingBalance;
              }
              if (recovered.meta.closingBalance != null) {
                balances.closing = recovered.meta.closingBalance;
              }
              if (recovered.checksumOk) {
                logger.info('[PDF_PARSER] Chase pdfplumber recovery accepted', {
                  txnCount: transactions.length,
                  checksumOk: true
                });
              } else {
                logger.warn('[PDF_PARSER] Chase pdfplumber best-effort (checksum failed)', {
                  txnCount: transactions.length,
                  checksumOk: false,
                  plumberTxnCount: plumberRaw?.length ?? 0
                });
              }
            } else {
              transactions = [];
              logger.warn('[PDF_PARSER] Chase profile failed — no usable plumber rows', {
                error: pipelineErr.message,
                checksumOk: recovered?.reconciliation?.checksumOk ?? false,
                plumberTxnCount: plumberRaw?.length ?? 0
              });
            }
          } else if (profile.id === 'wells_initiate_checking' && transactions.length > 0) {
            logger.info('[PDF_PARSER] Wells profile extract retained — skipping legacy extract', {
              txnCount: transactions.length,
              checksumOk: pipelineResult?.reconciliation?.checksumOk ?? false
            });
          } else if (
            shouldBlockLegacyExtract({
              profileId: profile.id,
              profileRowsRetained: transactions.length > 0,
              rawBundle:
                transactions.length > 0
                  ? { extractionMode: 'profile_strict', transactions }
                  : null
            })
          ) {
            logToxicFallbackBlocked({
              profileId: profile.id,
              transactions,
              rawBundle: { extractionMode: 'profile_strict', transactions }
            });
          } else {
            logger.warn('[PDF_PARSER] Pipeline failed — legacy transaction extract', {
              profileId: profile.id,
              error: pipelineErr.message
            });
            let bodyText =
              stitcher.typeB.combinedText?.trim().length > 0
                ? stitcher.typeB.combinedText
                : data.text;
            if (options?.layoutTemplate?.headerAnchors) {
              bodyText = this._applyHeaderAnchorsMulti(bodyText, options.layoutTemplate);
            }
            transactions = await this._extractTransactions(
              bodyText,
              this.bankParsers.get(resolvedBankType) || this.bankParsers.get('DEFAULT'),
              {
                defaultYear,
                layoutTemplate: options.layoutTemplate,
                layoutAnchorsOnly: Boolean(options.layoutTemplate?.layoutAnchorsOnly),
                stitcher,
                bodyText
              }
            );
            if (stitcher.typeA.printed.opening != null) balances.opening = stitcher.typeA.printed.opening;
            if (stitcher.typeA.printed.closing != null) balances.closing = stitcher.typeA.printed.closing;
          }
        }
      }

      if (stitcher.typeA.printed.opening != null && balances.opening == null) {
        balances.opening = stitcher.typeA.printed.opening;
      }
      if (stitcher.typeA.printed.closing != null && balances.closing == null) {
        balances.closing = stitcher.typeA.printed.closing;
      }

      let layoutPipelineShadow = null;
      let layoutPipelineResult = null;
      const runLayoutPipeline =
        options.forceLayoutFirstShadow ||
        options.forceLayoutFirstPrimary ||
        layoutFirstShadowEnabled() ||
        layoutFirstPrimaryEnabled();

      if (runLayoutPipeline) {
        try {
          const usePrimary =
            options.forceLayoutFirstPrimary ?? layoutFirstPrimaryEnabled();
          const layoutResult = await runLayoutFirstPipeline(buffer, {
            text: data.text,
            altText: stitcher.typeB?.combinedText,
            rtn: waterfallResult.rtn ?? null,
            bankName: bankNameFromTriage || accountInfo.bankName,
            profileId: profile.id,
            fileName: options?.fileName,
            defaultYear,
            pageCount: data.numpages,
            stitcher,
            layoutTemplate: options?.layoutTemplate,
            parserService: this,
            resolvedBankType,
            plumberTransactions,
            stitcherPrinted: mergePrintedTotals(
              stitcher.typeA?.printed ?? null,
              stitcher.typeA?.text || data.text
            ),
            typeAText: stitcher.typeA?.text ?? null,
            accountNumber: accountInfo.accountNumber || indicators.accountNumber || null,
            applicationContext: this._resolveAnchorOptions(options),
            anchorData: this._resolveAnchorOptions(options),
            enableVeraFallback:
              options.enableVeraFallback ??
              (usePrimary && layoutFirstVeraFallbackEnabled())
          });

          layoutPipelineShadow = comparePipelineShadow(
            {
              transactions,
              reconciliation: pipelineResult?.reconciliation ?? wellsReconciliation,
              profileId: profile.id,
              metadata: { extractionProfile: pipelineResult?.profileId ?? profile.id }
            },
            layoutResult
          );
          layoutPipelineResult = layoutResult;

          if (usePrimary && layoutResult.transactions?.length > 0) {
            transactions = layoutResult.transactions;
            const layoutRecon =
              layoutResult.reconciliation?.reconciliationBreakdown ?? layoutResult.reconciliation;
            pipelineResult = {
              ...(pipelineResult ?? {}),
              profileId: layoutResult.profileId,
              extractionTier: layoutResult.extractionTier,
              reconciliation: layoutRecon,
              meta: layoutResult.meta
            };
            wellsReconciliation = layoutRecon;
            if (layoutResult.meta?.openingBalance != null) {
              balances.opening = layoutResult.meta.openingBalance;
            }
            if (layoutResult.meta?.closingBalance != null) {
              balances.closing = layoutResult.meta.closingBalance;
            }
            logger.info('[PDF_PARSER] Layout-first primary path applied', {
              txnCount: transactions.length,
              checksumOk: layoutRecon?.checksumOk ?? false
            });
          }
        } catch (layoutErr) {
          logger.warn('[LAYOUT_PIPELINE_SHADOW] layout-first run failed', {
            error: layoutErr.message,
            profileId: profile.id
          });
        }
      }

      logger.info('[PDF_PARSER] Extracted balances.');

      // Vera AI Extraction Guard / Final Sanity Check
      if (balances.closing === 0 && transactions.length > 0) {
        logger.info('[PDF_PARSER] Detected $0 balance with active transactions. Attempting secondary balance extraction...');
        try {
          const recoveryPrompt = `CRITICAL EXTRACTION TASK. This bank statement has ${transactions.length} transactions but regex extracted a $0 Ending Balance. 
          Please find the ACTUAL "Ending Balance", "Closing Balance", or "New Balance" from the summary section.
          Return ONLY a JSON object: {"closingBalance": X.XX}.
          
          Statement Text Excerpt (Summary Area):
          ${data.text.slice(0, 3000)} ... ${data.text.slice(-3000)}`;

          const recoveryResponse = await this.perplexityService.analyzeText(recoveryPrompt);
          const recovered = this._extractObjectResponse(recoveryResponse);
          if (recovered && typeof recovered.closingBalance === 'number' && recovered.closingBalance > 0) {
            logger.info('[PDF_PARSER] Vera AI successfully recovered closing balance:', { recovered: recovered.closingBalance });
            balances.closing = recovered.closingBalance;
          }
        } catch (recoveryErr) {
          logger.warn('[PDF_PARSER] Vera AI recovery attempt failed', { error: recoveryErr.message });
        }
      }

      const statementPeriod = this._extractStatementPeriodFromHeader(data.text.slice(0, 2000));
      logger.info(`[PDF_PARSER] Statement period: ${statementPeriod ? `${statementPeriod.start?.toISOString()} → ${statementPeriod.end?.toISOString()} (${statementPeriod.days}d)` : 'not detected'}`);

      logger.info('[PDF_PARSER] Successfully parsed statement.');
      const resolvedBankName = bankNameFromTriage || accountInfo.bankName;
      const baseResult = {
        success: true,
        metadata: {
          pageCount: data.numpages,
          bankType: resolvedBankType,
          parsed: new Date().toISOString(),
          identityMethod,
          rtn: waterfallResult.rtn ?? null,
          fdicCert: waterfallResult.fdicCert ?? null,
          usedLayoutTemplate: Boolean(options?.layoutTemplate),
          stitcher: {
            pageCount: stitcher.pageCount,
            printedSummary: stitcher.typeA.printed,
            footer: stitcher.typeC.footer
          },
          extractionProfile: pipelineResult?.profileId ?? profile.id,
          profileConfidence: profile.confidence,
          profileReconciliation:
            pipelineResult?.reconciliation ?? wellsReconciliation ?? null,
          wellsReconciliation:
            profile.id === 'wells_initiate_checking'
              ? pipelineResult?.reconciliation ?? wellsReconciliation
              : undefined,
          extractionTier: pipelineResult?.extractionTier ?? null,
          dailyBalanceRule: pipelineResult?.dailyBalanceRule ?? null,
          rescueOutcome: pipelineResult?.meta?.rescueOutcome ?? pipelineResult?.rescueOutcome ?? null,
          ocrRescueApplied: pipelineResult?.meta?.ocrRescueApplied ?? false,
          ocrRescueFailed: pipelineResult?.meta?.ocrRescueFailed ?? false,
          aiRetryApplied: pipelineResult?.meta?.aiRetryApplied ?? false,
          columnFlipRepaired: pipelineResult?.meta?.columnFlipRepaired ?? false,
          droppedRowCount: plumberResult?.droppedRows?.length ?? 0,
          uncertainAssignmentCount: plumberResult?.uncertainAssignments?.length ?? 0,
          rawLedgerApplied: pipelineResult?.meta?.rawLedgerApplied ?? false,
          rawLedgerOutcome: pipelineResult?.meta?.rawLedgerOutcome ?? 'RESCUE_SKIPPED',
          rawWordRowCount: plumberResult?.rawWordRows?.length ?? 0,
          layoutPipelineShadow,
          layoutPipelineFeeTransactions: layoutPipelineResult?.feeTransactions ?? [],
          layoutPipelineDocumentMap: layoutPipelineResult?.documentMap ?? null,
          layoutPipelineContextArchive: layoutPipelineResult?.contextArchive ?? null,
          layoutPipelineIdentityMap: layoutPipelineResult?.identityMap ?? null,
          plumberTxnCount:
            plumberTransactions?.length ??
            pipelineResult?.chasePlumberTransactions?.length ??
            0,
        },
        rtn: waterfallResult.rtn ?? null,
        fdicCert: waterfallResult.fdicCert ?? null,
        bankName: resolvedBankName,
        bankNameConfidence,
        requiresBankConfirmation: resolveRequiresBankConfirmation({
          identityMethod,
          bankName: resolvedBankName,
          bankNameConfidence,
          profileConfidence: profile.confidence
        }),
        accountNumber: accountInfo.accountNumber || indicators.accountNumber || null,
        accountInfo: {
          ...accountInfo,
          verifiedAccountHolder: accountHolderName,
          verifiedAddress: statementAddress
        },
        statementPeriod,
        balances,
        openingBalance: balances.opening,
        closingBalance: balances.closing,
        availableBalance: balances.available,
        averageDailyBalance: balances.averageDaily,
        transactions,
        rawWordRows: pipelineResult?.rawWordRows ?? plumberResult?.rawWordRows ?? [],
        fallback:
          (!transactions || transactions.length === 0) &&
          (plumberResult?.rawWordRows?.length || pipelineResult?.rawWordRows?.length)
            ? {
                mode: 'raw_word',
                note: 'Layout not recognized. Raw word ledger provided for manual review or AI reconstruction.',
                rawWordRowCount:
                  plumberResult?.rawWordRows?.length ||
                  pipelineResult?.rawWordRows?.length ||
                  0,
              }
            : null,
        rescueOutcome: pipelineResult?.meta?.rescueOutcome ?? pipelineResult?.rescueOutcome ?? null,
        ...(options?.includeRawText ? { rawText: data.text } : {})
      };

      if (pipelineResult?.extractionTier === 1) {
        return baseResult;
      }

      const plumberResultResolved = plumberResult;
      const dualStitcherPrinted = mergePrintedTotals(
        stitcher.typeA?.printed ?? null,
        stitcher.typeA?.text || data.text
      );
      return applyDualEngineToParseResult(baseResult, plumberResultResolved, {
        fileName: options?.fileName,
        correlationId: options?.correlationId,
        onProgress: options?.correlationId
          ? (payload) => setBatchProgress(options.correlationId, payload)
          : undefined,
        text: data.text,
        defaultYear,
        rtn: waterfallResult.rtn ?? null,
        accountNumber: accountInfo.accountNumber || indicators.accountNumber || null,
        stitcherPrinted: dualStitcherPrinted,
        typeAText: stitcher.typeA?.text ?? null,
        // Rescue candidate overlay: the repaired plumber ledger and the base
        // ledger the rescue compared. The selector scores the repaired
        // candidate as a first-class contender instead of only the raw branch.
        rescueCandidates: pipelineResult?.rescueCandidates ?? null
      });
    } catch (error) {
      // Let DocumentTriageError propagate as-is so callers can distinguish non-statement files
      if (error instanceof DocumentTriageError) {
        throw error;
      }
      logger.error(`PDF parsing failed for bankType ${resolvedBankType}:`, error);
      throw new PDFParseError(`Failed to parse PDF: ${error.message}`);
    }
  }

  _parseTfsWithPdf2Json(buffer, options) {
    return new Promise((resolve, reject) => {
      const pdfParser = new PDFParser(this, 1);

      pdfParser.on("pdfParser_dataError", errData => {
        logger.error('pdf2json error:', errData.parserError);
        reject(new PDFParseError('Failed to parse PDF with pdf2json.'));
      });

      pdfParser.on("pdfParser_dataReady", async (pdfData) => {
        try {
          const textContent = pdfParser.getRawTextContent();
          const anchorPayload = this._resolveAnchorOptions(options);
          const wfLogOpts = {
            suppressDetailLogs: Boolean(options?.suppressWaterfallDetailLogs),
            correlationId: options?.correlationId
          };
          const waterfallResult = this._resolveIdentityWaterfall(textContent, anchorPayload, wfLogOpts);

          const parser = this.bankParsers.get('TFS');
          const defaultYear = this._detectStatementYear(textContent);
          const accountInfo = await this._extractAccountInfo(textContent, 'TFS');

          // Enrich TFS accountInfo with generic extractors if needed
          if (!accountInfo.bankName) {
            accountInfo.bankName = this._extractBankNameGeneric(textContent);
          }
          if (!accountInfo.accountNumber) {
            accountInfo.accountNumber = this._extractAccountNumberGeneric(textContent);
          }

          let bodyText = textContent;
          if (options?.layoutTemplate?.headerAnchors) {
            bodyText = this._applyHeaderAnchorsMulti(textContent, options.layoutTemplate);
          }

          const transactions = await this._extractTransactions(bodyText, parser, {
            defaultYear,
            layoutTemplate: options.layoutTemplate
          });
          const balances = await this._extractBalances(textContent, 'TFS');
          const statementPeriod = this._extractStatementPeriodFromHeader(textContent.slice(0, 2000));

          resolve({
            success: true,
            metadata: {
              pageCount: pdfData.Pages.length,
              bankType: 'TFS',
              parsed: new Date().toISOString(),
              identityMethod: waterfallResult.identityMethod,
              rtn: waterfallResult.rtn ?? null,
              fdicCert: waterfallResult.fdicCert ?? null,
              usedLayoutTemplate: Boolean(options?.layoutTemplate)
            },
            rtn: waterfallResult.rtn ?? null,
            fdicCert: waterfallResult.fdicCert ?? null,
            bankName: accountInfo.bankName,
            accountInfo,
            statementPeriod,
            balances,
            openingBalance: balances.opening,
            closingBalance: balances.closing,
            availableBalance: balances.available,
            averageDailyBalance: balances.averageDaily,
            transactions,
            ...(options?.includeRawText ? { rawText: textContent } : {})
          });
        } catch (error) {
          logger.error('Error processing parsed TFS PDF data:', error);
          reject(new PDFParseError(`Failed to process TFS PDF data: ${error.message}`));
        }
      });

      pdfParser.parseBuffer(buffer);
    });
  }

  _extractTfsTransactionsFromData(pdfData) {
    const transactions = [];
    const yTolerance = 0.5; // A smaller tolerance for more accurate line grouping
    const dateX = 10;
    const descX = 20;
    const amountX = 45;

    let lines = [];
    pdfData.Pages.forEach((page, pageIndex) => {
        const texts = page.Texts;
        if (!texts || texts.length === 0) return;

        // Sort texts primarily by Y, then X coordinate
        texts.sort((a, b) => a.y === b.y ? a.x - b.x : a.y - b.y);

        let pageLines = [];
        if (texts.length > 0) {
            let currentLine = [texts[0]];
            for (let i = 1; i < texts.length; i++) {
                // If the vertical distance is small, it's part of the same line
                if (Math.abs(texts[i].y - texts[i-1].y) < yTolerance) {
                    currentLine.push(texts[i]);
                } else {
                    // New line, push the old one and start a new one
                    currentLine.sort((a, b) => a.x - b.x); // Sort items on the line by x-coordinate
                    pageLines.push(currentLine);
                    currentLine = [texts[i]];
                }
            }
            currentLine.sort((a, b) => a.x - b.x);
            pageLines.push(currentLine);
        }
        
        // Decode text for the entire page's lines
        const decodedPageLines = pageLines.map(line => 
            line.map(text => ({
                text: decodeURIComponent(text.R[0].T).trim(),
                x: text.x,
                y: text.y
            }))
        );

        lines = lines.concat(decodedPageLines);
    });


    const dateRegex = /^\d{2}-\d{2}/;
    let inTransactionSection = false;
    let multiLineDescription = '';

    for (const line of lines) {
        const trimmedLine = line.text.trim();
        logger.debug(`[_extractTfsTransactionsFromData] Processing Line: "${trimmedLine}" | inTransactionSection: ${inTransactionSection}`);

        if (trimmedLine.includes('Date Transaction Detail Amount($) Balance($)')) {
            inTransactionSection = true;
            multiLineDescription = ''; // Reset on new section
            logger.debug('[_extractTfsTransactionsFromData] Transaction section started.');
            continue;
        }

        if (trimmedLine.includes('Ending Balance') || trimmedLine.includes('Average Daily Balance') || trimmedLine.includes('Items Paid')) {
            if (inTransactionSection) {
                logger.debug('[_extractTfsTransactionsFromData] Transaction section ended.');
                inTransactionSection = false;
            }
            continue;
        }

        if (!inTransactionSection) {
            continue;
        }

        const isTransactionLine = dateRegex.test(trimmedLine);

        if (isTransactionLine) {
            // If we have a pending multi-line description, it belongs to the previous transaction, which we can't easily map back.
            // For now, we'll reset it. A more advanced implementation might hold the previous transaction and append to its description.
            if (multiLineDescription) {
                logger.debug('[_extractTfsTransactionsFromData] Discarding multi-line description.');
                multiLineDescription = '';
            }

            if (trimmedLine.includes('Beginning Balance')) {
                logger.debug('[_extractTfsTransactionsFromData] Skipping "Beginning Balance" line.');
                continue;
            }

            // Regex to capture date, description, and the rest of the line
            const transRegex = /^(?<date>\d{2}-\d{2})\s+(?<desc>.*?)\s+(?<amounts>[\d,.-]+\s*[\d,.-]*\s*[\d,.-]*)$/;
            const match = trimmedLine.match(transRegex);

            if (match && match.groups) {
                const { date, desc, amounts } = match.groups;
                const amountParts = amounts.trim().split(/\s+/);
                
                let description = desc.trim();
                let amount = NaN;
                let balance = NaN;
                let type = 'Credit';

                // Scenarios for amount and balance parsing
                if (amountParts.length === 2) { // Standard credit or simple debit
                    amount = parseFloat(amountParts[0].replace(/,/g, ''));
                    balance = parseFloat(amountParts[1].replace(/,/g, ''));
                    if (description.includes('Transfer To') || description.startsWith('POS') || description.startsWith('Paid To')) {
                        type = 'Debit';
                    }
                } else if (amountParts.length === 3 && amountParts[1] === '-') { // Explicit debit with '-' sign
                    type = 'Debit';
                    amount = parseFloat(amountParts[0].replace(/,/g, ''));
                    balance = parseFloat(amountParts[2].replace(/,/g, ''));
                } else if (amountParts.length === 1 && amountParts[0] !== '-') { // Edge case, maybe only balance is present
                     balance = parseFloat(amountParts[0].replace(/,/g, ''));
                }


                if (type === 'Debit') {
                    amount = -Math.abs(amount);
                }
                
                logger.debug('[_extractTfsTransactionsFromData] Parsed transaction row.', { date, type });

                if (date && description && !isNaN(amount) && !isNaN(balance)) {
                    transactions.push({ date, description, amount, balance, type });
                    logger.debug(`[_extractTfsTransactionsFromData] Added transaction #${transactions.length}`);
                } else {
                    logger.debug('[_extractTfsTransactionsFromData] Incomplete transaction data, might be a multi-line description.');
                    multiLineDescription = description; // Store for next line
                }
            } else {
                logger.debug('[_extractTfsTransactionsFromData] Line did not match transaction regex.');
            }
        } else if (inTransactionSection && transactions.length > 0) {
            // This is likely a continuation of a description
            const lastTransaction = transactions[transactions.length - 1];
            if (lastTransaction) {
                const newDescription = `${lastTransaction.description} ${trimmedLine}`;
                logger.debug('[_extractTfsTransactionsFromData] Appending to description of last transaction.');
                lastTransaction.description = newDescription;
            }
        }
    }


    logger.debug(`[_extractTfsTransactionsFromData] Found ${transactions.length} transactions.`);
    return transactions;
  }

  _extractAccountInfo(rawText, bankType) {
    let bankName = this._extractBankNameGeneric(rawText);

    // TFS-specific overrides
    if (bankType === 'TFS') {
      if (!bankName) bankName = 'Navy Federal Credit Union';
      const tfsAccountPattern = /Account Number:\s*(\S+)\s*Balance:\s*\$?([\d,]+\.\d{2})/;
      const tfsMatch = rawText.match(tfsAccountPattern);
      if (tfsMatch) {
        return {
          bankName: bankName || 'Navy Federal Credit Union',
          accountNumber: tfsMatch[1],
          balance: parseFloat(tfsMatch[2].replace(/,/g, ''))
        };
      }
      return { bankName: bankName || 'Navy Federal Credit Union' };
    }

    // Generic extraction for other banks
    const accountNumber = this._extractAccountNumberGeneric(rawText);
    const accountHolderMatch = rawText.match(/Account Holder:?\s*([^\n]+)/);

    return {
      bankName: bankName || 'Unknown',
      ...(accountNumber ? { accountNumber } : {}),
      ...(accountHolderMatch ? { accountHolder: accountHolderMatch[1].trim() } : {})
    };
  }

  async _extractBalances(rawText, bankType) {
      let openingBalance = null, closingBalance = null, availableBalance = null, averageDailyBalance = null;
      const parser = this.bankParsers.get(bankType) || this.bankParsers.get('DEFAULT');

      const parseAmountValue = (value) => {
        // Use pickNumeric for consistent validation across all balance extraction
        return pickNumeric(value, {
          maxAmount: getAbsurdityThreshold(),
          allowNegative: false, // Balances should not be negative (use NSF alerts instead)
          strictDecimal: typeof value === 'string' // Require 2 decimals for strings
        });
      };

      const extractJsonObject = (value) => this._extractObjectResponse(value);

      if (bankType === 'TFS') {
          // For TFS, extract balances from the end of the document
          const balanceSectionPattern = /Balance as of.*?\n([\s\S]*?)\n\n/;
          const balanceSectionMatch = rawText.match(balanceSectionPattern);
          if (balanceSectionMatch) {
              const balancesText = balanceSectionMatch[1];
              openingBalance = parser.parseAmount(balancesText.split('\n')[0]) || 0;
              closingBalance = parser.parseAmount(balancesText.split('\n')[1]) || 0;
          }
      } else {
              try {
                const summaryWindow = rawText.length > 7000
                  ? rawText.slice(0, 3500) + '\n...\n' + rawText.slice(-3500)
                  : rawText;

                const balancePrompt = 'Find the Beginning Balance (Summary) and Ending Balance (Summary) for this statement. Return a JSON object: {"openingBalance": X.XX, "closingBalance": Y.YY}. IMPORTANT: Ignore "Current Balance" or "Available Balance" if they appear in individual transaction rows. Look only at the Account Summary table usually found at the top or bottom.' +
                  '\n\nStatement text:\n' + summaryWindow;

                const aiResponse = await this.perplexityService.analyzeText(balancePrompt);
                const aiBalances = extractJsonObject(aiResponse);

                if (aiBalances) {
                  const aiOpening = parseAmountValue(aiBalances.openingBalance);
                  const aiClosing = parseAmountValue(aiBalances.closingBalance);

                  if (aiOpening !== null) openingBalance = aiOpening;
                  if (aiClosing !== null) closingBalance = aiClosing;
                }
              } catch (aiErr) {
                logger.warn('[PDF_PARSER] AI balance extraction failed — using regex fallback', { error: aiErr.message });
              }

              if (closingBalance === null) {
                // Improved regex with strict boundaries to avoid capturing long numeric strings like routing numbers
                const closingBalancePattern = /(?:Ending Balance|Closing Balance)[\s\S]{0,50}?(?:^|\s)\$?\s*((?:\d{1,3}(?:,\d{3})*|\d+)\.\d{2})(?!\d)/im;
                const closingBalanceMatch = rawText.match(closingBalancePattern);
                if (closingBalanceMatch) {
                  const regexClosing = parser.parseAmount(closingBalanceMatch[1]) || 0;
                  closingBalance = regexClosing > getAbsurdityThreshold() ? null : regexClosing;
                }
          }

              if (openingBalance === null) {
                // Opening balance — Chase uses "Beginning Balance", others use "Opening/Previous Balance"
                const openingBalancePattern = /(?:Beginning Balance|Opening Balance|Previous Balance)[\s\S]{0,50}?(?:^|\s)\$?\s*((?:\d{1,3}(?:,\d{3})*|\d+)\.\d{2})(?!\d)/im;
                const openingBalanceMatch = rawText.match(openingBalancePattern);
                if (openingBalanceMatch) {
                  const regexOpening = parser.parseAmount(openingBalanceMatch[1]) || 0;
                  openingBalance = regexOpening > getAbsurdityThreshold() ? null : regexOpening;
                }
          }

          const availableBalancePattern = /(?:Available Balance|Current Balance)[\s\S]{0,50}?(?:^|\s)\$?\s*((?:\d{1,3}(?:,\d{3})*|\d+)\.\d{2})(?!\d)/im;
          const availableBalanceMatch = rawText.match(availableBalancePattern);
          if (availableBalanceMatch) {
              availableBalance = parser.parseAmount(availableBalanceMatch[1]) || 0;
          }

          // For average daily balance, look for a specific label
          const averageDailyBalancePattern = /(?:Average Daily Balance)[:\s]+(?:\$?\s*)((?:\d{1,3}(?:,\d{3})*|\d+)\.\d{2})(?!\d)/i;
          const averageDailyBalanceMatch = rawText.match(averageDailyBalancePattern);
          if (averageDailyBalanceMatch) {
              averageDailyBalance = parser.parseAmount(averageDailyBalanceMatch[1]) || 0;
          }
      }

      return { opening: openingBalance, closing: closingBalance, available: availableBalance, averageDaily: averageDailyBalance };
  }

  /**
   * Controller passes either { anchorData: {...} } or flat anchor fields as the second arg.
   */
  _resolveAnchorOptions(options) {
    if (!options || typeof options !== 'object') return {};
    if (options.anchorData && typeof options.anchorData === 'object') return options.anchorData;
    const { bankType, includeRawText, layoutTemplate, suppressWaterfallDetailLogs: _sw, anchorData: _a, ...rest } =
      options;
    return rest;
  }

  _applyHeaderAnchors(fullText, layoutTemplate) {
    if (!fullText || !layoutTemplate?.headerAnchors) return fullText;
    const anchors = layoutTemplate.headerAnchors;
    let s = fullText;
    const start = anchors.tableStart != null ? String(anchors.tableStart).trim() : '';
    if (start) {
      const i = s.indexOf(start);
      if (i >= 0) s = s.slice(i);
    }
    const end = anchors.tableEnd != null ? String(anchors.tableEnd).trim() : '';
    if (end) {
      const j = s.indexOf(end);
      if (j >= 0) s = s.slice(0, j + end.length);
    }
    return s;
  }

  /**
   * Slice and concatenate all transaction regions (Regions multi-table layouts).
   * @param {string} fullText
   * @param {object} layoutTemplate
   * @returns {string}
   */
  _applyHeaderAnchorsMulti(fullText, layoutTemplate) {
    if (!fullText) return fullText;
    const sections = layoutTemplate?.transactionSections;
    if (!Array.isArray(sections) || sections.length === 0) {
      return this._applyHeaderAnchors(fullText, layoutTemplate);
    }

    const chunks = [];
    for (const sec of sections) {
      const start = String(sec.tableStart ?? sec.start ?? '').trim();
      const end = String(sec.tableEnd ?? sec.end ?? '').trim();
      if (!start) continue;
      const i = fullText.indexOf(start);
      if (i < 0) continue;
      let slice = fullText.slice(i);
      if (end) {
        const j = slice.indexOf(end);
        if (j >= 0) slice = slice.slice(0, j + end.length);
      }
      chunks.push(slice);
    }

    if (chunks.length === 0) {
      return this._applyHeaderAnchors(fullText, layoutTemplate);
    }
    return chunks.join('\n\n--- SECTION ---\n\n');
  }

  _splitLineIntoColumns(line) {
    return String(line)
      .split(/\s{2,}|\t+/)
      .map((t) => t.trim())
      .filter(Boolean);
  }

  _normalizeAmountTokenForMathPattern(token, mathPattern) {
    let t = String(token ?? '').trim();
    if (!t) return t;
    if (mathPattern === 'PARENTHESES') {
      const compact = t.replace(/\$/g, '').trim();
      if (/^\([^)]+\)$/.test(compact)) {
        const inner = compact.replace(/^\(/, '').replace(/\)$/, '').trim();
        if (inner && !inner.startsWith('-')) return `-${inner}`;
      }
    }
    return t;
  }

  _parseSingleMoneyToken(token) {
    const m = String(token ?? '').match(/\(?-?\$?\s*[\d,]+\.\d{2}\)?/);
    if (!m) return null;
    return PDFParserService._normalizeAmount(m[0]);
  }

  async _extractTransactionsColumnMapped(rawText, parser, context) {
    const stitcher = context.stitcher ?? stitchStatement(rawText);
    context.stitcher = stitcher;
    const gridText =
      context.bodyText?.trim().length > 0
        ? context.bodyText
        : stitcher.typeB.combinedText?.trim().length > 0
          ? stitcher.typeB.combinedText
          : rawText;

    const layoutTemplate = context.layoutTemplate;
    const cm = layoutTemplate.columnMapping;
    const mathPattern = layoutTemplate.mathPattern || 'MINUS_PREFIX';
    const effectiveParser = parser || this.bankParsers.get('DEFAULT');
    const defaultYear = context.defaultYear ?? this._detectStatementYear(rawText);
    const lines = gridText.split(/\r?\n/);
    const transactions = [];
    let lastTransaction = null;

    const maxCol = Math.max(
      cm.dateCol,
      cm.descCol,
      cm.amountCol,
      cm.balanceCol == null ? -1 : cm.balanceCol
    );

    for (let index = 0; index < lines.length; index += 1) {
      const rawLine = lines[index];
      const line = rawLine.trim();
      if (!line) continue;

      if (isSummaryLedgerLine(line)) {
        lastTransaction = null;
        continue;
      }

      if (this._isNonTransactionLine(line)) {
        lastTransaction = null;
        continue;
      }

      const tokens = this._splitLineIntoColumns(line);
      if (tokens.length <= maxCol) {
        if (lastTransaction && !this._looksLikeSectionHeader(line)) {
          lastTransaction.description = `${lastTransaction.description} ${line}`.trim();
        } else {
          lastTransaction = null;
        }
        continue;
      }

      const dateTok = tokens[cm.dateCol];
      const descTok = tokens[cm.descCol] ?? '';
      const amountTokRaw = tokens[cm.amountCol];
      const amountTok = this._normalizeAmountTokenForMathPattern(amountTokRaw, mathPattern);
      const syntheticLine = `${dateTok} ${amountTok}`.trim();

      const dateValue = this._parseDateFromLine(syntheticLine, effectiveParser, defaultYear);
      let amountInfo = this._parseAmountFromLine(syntheticLine, effectiveParser);

      if (dateValue && amountInfo) {
        if (cm.balanceCol != null && cm.balanceCol !== cm.amountCol && tokens.length > cm.balanceCol) {
          const balNum = this._parseSingleMoneyToken(tokens[cm.balanceCol]);
          if (typeof balNum === 'number' && Number.isFinite(balNum)) {
            amountInfo = { ...amountInfo, balance: balNum };
          }
        }

        const description = String(descTok).trim() || this._parseDescriptionFromLine(syntheticLine, effectiveParser);

        const transaction = stageParsedTransaction({
          date: dateValue,
          description,
          amount: amountInfo.amount,
          type: amountInfo.type,
          balance: amountInfo.balance,
          lineNumber: index + 1,
          rawLine,
          excludeFromMacroTotals: false
        });

        transactions.push(transaction);
        lastTransaction = transaction;
      } else if (lastTransaction && !this._looksLikeSectionHeader(line)) {
        lastTransaction.description = `${lastTransaction.description} ${line}`.trim();
      } else {
        lastTransaction = null;
      }
    }

    return transactions;
  }

  async _extractTransactions(rawText, parser, context = {}) {
      if (!rawText || typeof rawText !== 'string') {
        return [];
      }

      const stitcher = context.stitcher ?? stitchStatement(rawText);
      context.stitcher = stitcher;
      const isWells = /initiate business checking|wells fargo/i.test(rawText);
      const typeBOnly =
        stitcher.typeB.combinedText?.trim().length > 0 &&
        stitcher.typeB.combinedText.trim() !== String(rawText || '').trim();
      const gridText = typeBOnly ? stitcher.typeB.combinedText : rawText;

      const useColumnPath =
        context.layoutTemplate?.columnMapping &&
        typeof context.layoutTemplate.columnMapping === 'object' &&
        !context.layoutAnchorsOnly &&
        !context.layoutTemplate?.layoutAnchorsOnly;

      if (useColumnPath) {
        const mapped = await this._extractTransactionsColumnMapped(rawText, parser, context);
        const minRows = Number(process.env.LAYOUT_COLUMN_MIN_ROWS) || 10;
        if (mapped.length >= minRows) return mapped;
        logger.warn('[PDF_PARSER] columnMapping fallback — low row yield', {
          mappedCount: mapped.length,
          minRows
        });
        const anchorsOnlyTemplate = { ...context.layoutTemplate };
        delete anchorsOnlyTemplate.columnMapping;
        delete anchorsOnlyTemplate.mathPattern;
        anchorsOnlyTemplate.layoutAnchorsOnly = true;
        anchorsOnlyTemplate.templateApplyMode = 'anchors_only';
        return this._extractTransactions(rawText, parser, {
          ...context,
          layoutTemplate: anchorsOnlyTemplate,
          layoutAnchorsOnly: true
        });
      }

      const effectiveParser = parser || this.bankParsers.get('DEFAULT');
      const defaultYear = context.defaultYear ?? this._detectStatementYear(rawText);
      const lines = gridText.split(/\r?\n/);
      const transactions = [];
      const genericTypeBLedger =
        !isWells &&
        !RE_TRANSACTION_HISTORY.test(gridText) &&
        /\d{1,2}\/\d{1,2}/.test(gridText);
      let lastTransaction = null;
      let inTxnSection = genericTypeBLedger;
      let pastSummaryAnchor = !isWells || stitcher.anchors.summaryEndSeen || typeBOnly;

      const opensTxnSection = (line) => {
        if (isWells) return RE_TRANSACTION_HISTORY.test(String(line || '').trim());
        return isTransactionSectionHeader(line);
      };

      for (let index = 0; index < lines.length; index += 1) {
        const rawLine = lines[index];
        const line = rawLine.trim();

        if (!line) {
          continue;
        }

        if (isWells && RE_PERIOD_SUMMARY_END_ANCHOR.test(line)) {
          pastSummaryAnchor = true;
          lastTransaction = null;
          continue;
        }

        if (opensTxnSection(line)) {
          if (!pastSummaryAnchor && isWells) continue;
          inTxnSection = true;
          lastTransaction = null;
          continue;
        }
        if (inTxnSection && RE_WELLS_TXN_SECTION_END.test(line)) {
          inTxnSection = false;
          lastTransaction = null;
          continue;
        }
        if (inTxnSection && RE_TXN_SUBSECTION_TOTAL.test(line)) {
          lastTransaction = null;
          continue;
        }
        if (!inTxnSection || (isWells && !pastSummaryAnchor)) {
          continue;
        }

        if (isSummaryLedgerLine(line)) {
          lastTransaction = null;
          continue;
        }

        if (this._isNonTransactionLine(line)) {
          lastTransaction = null;
          continue;
        }

        if (RE_SUMMARY_TOTAL_ROW.test(line)) {
          lastTransaction = null;
          continue;
        }

        const dateValue = this._parseDateFromLine(line, effectiveParser, defaultYear);
        const amountInfo = this._parseAmountFromLine(line, effectiveParser);

        if (dateValue && amountInfo) {
          const description = this._parseDescriptionFromLine(line, effectiveParser);

          const transaction = stageParsedTransaction({
            date: dateValue,
            description,
            amount: amountInfo.amount,
            type: amountInfo.type,
            balance: amountInfo.balance,
            rawAmount: amountInfo.rawAmount,
            lineNumber: index + 1,
            rawLine,
            excludeFromMacroTotals: isSummaryLedgerLine(line)
          });

          transactions.push(transaction);
          lastTransaction = transaction;
        } else if (dateValue && !amountInfo) {
          const description = this._parseDescriptionFromLine(line, effectiveParser);
          const pending = stageParsedTransaction({
            date: dateValue,
            description,
            amount: 0,
            type: inferTransactionTypeFromLine(line, 0),
            lineNumber: index + 1,
            rawLine,
            _pendingOrphanAmount: true,
            excludeFromMacroTotals: isSummaryLedgerLine(line)
          });
          transactions.push(pending);
          lastTransaction = pending;
        } else if (lastTransaction) {
          const orphan = PDFParserService._parseOrphanAmountLine(line, lastTransaction);
          if (orphan) {
            Object.assign(
              lastTransaction,
              stageParsedTransaction({
                ...lastTransaction,
                amount: orphan.amount,
                type: orphan.type,
                balance: orphan.balance,
                rawAmount: orphan.rawAmount
              })
            );
            delete lastTransaction._pendingOrphanAmount;
            lastTransaction = null;
          } else if (!this._looksLikeSectionHeader(line)) {
            lastTransaction.description = `${lastTransaction.description} ${line}`.trim();
          } else {
            lastTransaction = null;
          }
        } else {
          lastTransaction = null;
        }
      }

      const finalized = transactions.filter(
        (t) =>
          !t._pendingOrphanAmount &&
          !t.excludeFromMacroTotals &&
          Number.isFinite(Number(t.amount)) &&
          Number(t.amount) !== 0
      );
      return dedupeExactFingerprints(finalized);
  }

  /**
   * Wells Fargo / multi-line rows: amount on the next line without a date.
   * @param {string} line
   * @param {object|null} pendingTxn
   * @returns {{ amount: number, type: string }|null}
   */
  static _parseOrphanAmountLine(line, pendingTxn = null) {
    const trimmed = String(line || '').trim();
    if (!trimmed || /^\d{1,2}[-/]\d{1,2}/.test(trimmed)) return null;
    const matches = trimmed.match(/\(?-?\$?\s*[\d,]+\.\d{2}\)?/g);
    if (!matches?.length) return null;
    const desc = String(pendingTxn?.description || pendingTxn?.rawLine || '');
    const amount = PDFParserService._normalizeAmount(matches[0]);
    if (typeof amount !== 'number' || !Number.isFinite(amount)) return null;
    const type = inferTransactionTypeFromLine(desc, amount);
    const out = { amount: Math.abs(amount), type, rawAmount: matches[0] };
    if (matches.length > 1) {
      const bal = PDFParserService._normalizeAmount(matches[matches.length - 1]);
      if (typeof bal === 'number' && Number.isFinite(bal)) {
        out.balance = bal;
      }
    }
    return out;
  }

  _parseDateFromLine(line, parser, defaultYear) {
      if (!line) return null;

      let parsed = null;
      if (parser?.parseDate) {
        parsed = parser.parseDate(line, { defaultYear });
      }

      if (!parsed) {
        const fallbackMatch = line.match(/(\d{1,2})[-/](\d{1,2})(?:[-/](\d{2,4}))?/);
        if (fallbackMatch) {
          const [, monthStr, dayStr, yearStr] = fallbackMatch;
          const month = Number(monthStr);
          const day = Number(dayStr);
          const year = yearStr
            ? Number(yearStr.length === 2 ? `20${yearStr}` : yearStr)
            : defaultYear ?? new Date().getFullYear();
          if (Number.isFinite(month) && Number.isFinite(day) && Number.isFinite(year)) {
            const candidate = new Date(year, month - 1, day);
            if (!Number.isNaN(candidate.getTime())) {
              parsed = candidate;
            }
          }
        }
      }

      if (parsed instanceof Date && !Number.isNaN(parsed.getTime())) {
        return parsed.toISOString();
      }

      if (typeof parsed === 'string') {
        return parsed;
      }

      return null;
  }

  _parseAmountFromLine(line, parser) {
      if (!line) return null;

      const amountLine = PDFParserService.stripDatePrefixForAmountLine(line);

      // CRITICAL: Pre-validate that the line contains a valid amount pattern
      // Reject lines with only 9-digit routing numbers without decimals
      if (!hasValidAmountPattern(amountLine)) {
        // Check if it's just a routing number pattern
        if (/^\s*\d{9}\s*$/.test(amountLine.replace(/[,\s]/g, ''))) {
          logger.debug('[_parseAmountFromLine] Rejected: routing number pattern detected', {
            line: line.slice(0, 50)
          });
          return null;
        }
      }

      let amount = null;
      if (parser?.parseAmount) {
        const parsedAmount = parser.parseAmount(amountLine);
        if (typeof parsedAmount === 'number' && Number.isFinite(parsedAmount)) {
          // Validate using pickNumeric to catch routing numbers
          amount = pickNumeric(parsedAmount, {
            maxAmount: getAbsurdityThreshold(),
            allowNegative: true,
            strictDecimal: false // Parser already returns a number
          });
        }
      }

      // Match amounts with exactly 2 decimal places
      // Pattern: optional negative, optional $, digits with optional commas, period, exactly 2 digits
      const matches = amountLine.match(/\(?-?\$?\s*[\d,]+\.\d{2}\)?/g);
      let balance = null;

      if (matches && matches.length) {
        // Get context to validate this is likely an amount, not a routing number
        const context = getAmountContext(line, matches[0]);
        
        // If context suggests it's a routing number, skip it
        if (context.hasRoutingIndicator && !context.hasBalanceIndicator) {
          logger.debug('[_parseAmountFromLine] Skipped: routing number context detected', {
            match: matches[0],
            context: context.context
          });
          return null;
        }

        const primary = PDFParserService._normalizeAmount(matches[0]);
        if (amount === null && typeof primary === 'number') {
          amount = primary;
        }

        if (matches.length > 1) {
          const possibleBalance = PDFParserService._normalizeAmount(matches[matches.length - 1]);
          if (typeof possibleBalance === 'number') {
            balance = possibleBalance;
          }
        }
      }

      if (amount === null) {
        return null;
      }

      if (matches && matches.length === 2) {
        const swapped = applyTwoColumnBalanceAmountSwap(line, matches, amount, balance);
        amount = swapped.amount;
        balance = swapped.balance;
      }

      // Additional validation: reject suspiciously large amounts that are likely routing/account numbers
      const absAmount = Math.abs(amount);
      
      // Reject amounts over $1,000,000 - these are almost certainly routing or account numbers
      if (absAmount > 1_000_000) {
        logger.debug('[_parseAmountFromLine] Rejected: suspiciously large amount', {
          amount,
          line: line.slice(0, 50)
        });
        return null;
      }
      
      // Check if amount matches routing/account number patterns (8+ consecutive digits when decimal is removed)
      const amountStr = String(absAmount).replace('.', '');
      if (/^\d{8,}$/.test(amountStr)) {
        logger.debug('[_parseAmountFromLine] Rejected: matches routing/account number pattern', {
          amount,
          amountStr,
          line: line.slice(0, 50)
        });
        return null;
      }

      return {
        amount,
        balance,
        type: inferTransactionTypeFromLine(line, amount),
        rawAmount: matches?.[0] ?? String(amount)
      };
  }

  _parseDescriptionFromLine(line, parser) {
      if (!line) return '';

      if (parser?.parseDescription) {
        const parsed = parser.parseDescription(line);
        if (parsed) {
          return parsed;
        }
      }

      return line
        .replace(/(\d{1,2}[-/]\d{1,2}(?:[-/]\d{2,4})?)/g, '')
        .replace(/\(?-?\$?\s*[\d,]+\.\d{2}\)?/g, '')
        .replace(/\s{2,}/g, ' ')
        .trim();
  }

  _isNonTransactionLine(line) {
      const trimmed = (line || '').trim();
      // Rows that begin with a statement date are never discarded as section headers
      // (avoids skipping "POS DEBIT …", "CREDIT …", etc.).
      if (/^\d{1,2}[-/]\d{1,2}/.test(trimmed)) {
        return false;
      }

      const skipPatterns = [
        /^page\s+\d+/i,
        /^\s*statement\s+period\b/i,
        /^\s*(?:account\s+)?summary\s*:?\s*$/i,
        /^\s*transaction\s+summary\b/i,
        /digital banking/i,
        /this statement/i,
        /^\s*totals?\s*:?\s*$/i,
        /^\s*total\s+(?:credits?|debits?)\b/i,
        /ending balance/i,
        /average daily balance/i,
        /^\s*interest\b/i,
        /^\s*(?:total\s+)?credits?\s*:?\s*$/i,
        /^\s*(?:total\s+)?debits?\s*:?\s*$/i,
        /^\s*deposits?\s+and\s+credits?\s*$/i,
        /balance forward/i,
        /beginning balance/i,
        /items paid/i
      ];

      return skipPatterns.some((pattern) => pattern.test(trimmed));
  }

  _looksLikeSectionHeader(line) {
      return /(continued|section|details?|transactions?)/i.test(line);
  }

  _detectStatementYear(rawText) {
      if (!rawText || typeof rawText !== 'string') {
        return new Date().getFullYear();
      }

      const currentYear = new Date().getFullYear();

      // Priority 1: unambiguous MM/DD/YYYY or MM-DD-YYYY patterns in the full text.
      // Dollar amounts can never match this format, so these are always safe.
      const fullDateMatches = rawText.match(/\d{1,2}[\/\-]\d{1,2}[\/\-](20\d{2})\b/g);
      if (fullDateMatches && fullDateMatches.length > 0) {
        const years = fullDateMatches
          .map(m => parseInt(m.slice(-4), 10))
          .filter(y => y >= 2000 && y <= currentYear + 1);
        if (years.length > 0) {
          const freq = {};
          let modeYear = years[0], modeCount = 0;
          for (const y of years) {
            freq[y] = (freq[y] || 0) + 1;
            if (freq[y] > modeCount) { modeCount = freq[y]; modeYear = y; }
          }
          return modeYear;
        }
      }

      // Priority 2: header section only (first 1500 chars).
      // The statement year always appears in the header. Searching only the header
      // prevents transaction-body amounts like "$2,040.15" -> "2040.15" -> \b2040\b
      // (after pdf-parse strips commas) from outvoting the real statement year.
      const headerText = rawText.slice(0, 1500);
      const headerMatches = headerText.match(/\b(20\d{2})\b/g);
      if (headerMatches && headerMatches.length > 0) {
        const validYears = headerMatches
          .map(y => parseInt(y, 10))
          .filter(y => y >= 2000 && y <= currentYear + 1);
        if (validYears.length > 0) {
          const freq = {};
          let modeYear = validYears[0], modeCount = 0;
          for (const y of validYears) {
            freq[y] = (freq[y] || 0) + 1;
            if (freq[y] > modeCount) { modeCount = freq[y]; modeYear = y; }
          }
          return modeYear;
        }
      }

      return currentYear;
  }

  // ── Deterministic triage helpers ──────────────────────────────────────────

  _getHeaderWindow(text, len = 1000) {
    if (!text || typeof text !== 'string') return '';
    return text.slice(0, len);
  }

  _detectFinanceApplicationIndicators(text) {
    if (!text || typeof text !== 'string') return false;
    const appKeywords = [
      /\bfinance\s+application\b/i,
      /\brequested\s+loan\s+amount\b/i,
      /\bfinance\s+type\b/i,
      /\buse\s+of\s+funds\b/i,
      /\bdate\s+of\s+birth\b/i,
      /\bbusiness\s+start\s+date\b/i,
      /\btax\s+id\b/i,
    ];
    const matchCount = appKeywords.filter(p => p.test(text)).length;
    return matchCount >= 3;
  }

  /**
   * Identity Waterfall — four-level bank identity resolution.
   *
   * Level 1 (Hard-Lock)       — Routing Transit Number (RTN) match
   * Level 2 (Compliance-Lock) — FDIC Certificate Number match
   * Level 3 (Anchor-Lock)     — Application anchor data cross-reference (taxId / businessAddress / companyName)
   * Level 3.5 (Text-Brand-Lock) — HIGH-confidence bank brand fingerprint in statement header
   * Level 4 (Human-Required)  — No deterministic signal; caller must ask the user
   *
   * @param {string} text        Full statement text (not just the header window)
   * @param {object} anchorData  Optional: { taxId, businessAddress, companyName } from a submitted application
   * @param {{ suppressDetailLogs?: boolean, correlationId?: string }} [logOpts]
   * @returns {{ bankName: string|null, confidence: 'HIGH'|'LOW', identityMethod: string }}
   */
  _resolveIdentityWaterfall(text, anchorData = {}, logOpts = {}) {
    const suppressDetailLogs = Boolean(logOpts?.suppressDetailLogs);
    const wfLog = (level, msg, extra) => {
      if (!suppressDetailLogs) {
        logStructured(level, msg, {
          ...extra,
          ...(logOpts?.correlationId ? { correlationId: logOpts.correlationId } : {})
        });
      }
    };

    if (!text || typeof text !== 'string') {
      return { bankName: null, confidence: 'LOW', identityMethod: 'HUMAN_REQUIRED' };
    }

    // ── Level 1: Hard-Lock via Routing Transit Number ────────────────────────
    // Use centralized RTN map from bankIdentifiers.js (100+ routing numbers)
    const rtnBankMap = RTN_BANK_MAP;

    // Context-aware scan: prefer RTN found near a "Routing / ABA / Transit" label
    const rtnContextPattern = /(?:routing|aba|transit|rtn)[^\d]{0,30}(\d{9})/gi;
    let m;
    while ((m = rtnContextPattern.exec(text)) !== null) {
      const bank = rtnBankMap[m[1]];
      if (bank) {
        wfLog('info', '[WATERFALL] Level 1 Hard-Lock (context RTN)', {
          domain: 'parser-triage',
          waterfallLevel: 1,
          identityMethod: 'RTN_HARD_LOCK',
          rtn: m[1],
          bankName: bank,
          confidence: 'HIGH'
        });
        return { bankName: bank, confidence: 'HIGH', identityMethod: 'RTN_HARD_LOCK', rtn: m[1] };
      }
    }

    // Bare 9-digit fallback — RTNs are institutionally unique, still deterministic
    const bareRtnPattern = /\b(\d{9})\b/g;
    while ((m = bareRtnPattern.exec(text)) !== null) {
      const bank = rtnBankMap[m[1]];
      if (bank) {
        wfLog('info', '[WATERFALL] Level 1 Hard-Lock (bare RTN)', {
          domain: 'parser-triage',
          waterfallLevel: 1,
          identityMethod: 'RTN_HARD_LOCK',
          rtn: m[1],
          bankName: bank,
          confidence: 'HIGH'
        });
        return { bankName: bank, confidence: 'HIGH', identityMethod: 'RTN_HARD_LOCK', rtn: m[1] };
      }
    }

    // ── Level 2: Compliance-Lock via FDIC Certificate Number ─────────────────
    // Use centralized FDIC map from bankIdentifiers.js (20+ cert numbers)
    const fdicBankMap = FDIC_CERT_MAP;

    const fdicPattern = /FDIC[^0-9]{0,40}(\d{3,6})/gi;
    while ((m = fdicPattern.exec(text)) !== null) {
      const bank = fdicBankMap[m[1]];
      if (bank) {
        wfLog('info', '[WATERFALL] Level 2 Compliance-Lock (FDIC cert)', {
          domain: 'parser-triage',
          waterfallLevel: 2,
          identityMethod: 'FDIC_COMPLIANCE_LOCK',
          fdicCert: m[1],
          bankName: bank,
          confidence: 'HIGH'
        });
        return { bankName: bank, confidence: 'HIGH', identityMethod: 'FDIC_COMPLIANCE_LOCK', fdicCert: m[1] };
      }
    }

    // ── Level 3: Anchor-Lock via Application data ─────────────────────────────
    const { taxId, businessAddress, companyName } = anchorData;
    const anchorMatchedFields = [];

    // Tax ID matching (exact, with normalization)
    if (taxId && typeof taxId === 'string') {
      const normalizedTaxId = taxId.replace(/[-\s]/g, '');
      if (normalizedTaxId.length >= 4 && text.replace(/[-\s]/g, '').includes(normalizedTaxId)) {
        anchorMatchedFields.push('taxId');
        wfLog('info', '[WATERFALL] Level 3 Tax ID match', {
          domain: 'parser-triage',
          waterfallLevel: 3,
          identityMethod: 'ANCHOR_SIGNAL',
          detail: 'taxId',
          taxIdSuffix: normalizedTaxId.slice(-4)
        });
      }
    }

    // Business address matching (fuzzy with Levenshtein distance)
    if (businessAddress && typeof businessAddress === 'string') {
      const addrComponents = normalizeAddress(businessAddress);

      // Try fuzzy matching on street address (most unique component)
      if (addrComponents.street && addrComponents.street.length >= 5) {
        const fuzzyMatchFound = fuzzyMatch(addrComponents.street, text, {
          threshold: 0.80, // 80% similarity for addresses (allow for typos/abbreviations)
          minLength: 5
        });
        if (fuzzyMatchFound) {
          anchorMatchedFields.push('businessAddress');
          wfLog('info', '[WATERFALL] Level 3 fuzzy address match', {
            domain: 'parser-triage',
            waterfallLevel: 3,
            identityMethod: 'ANCHOR_SIGNAL',
            detail: 'businessAddress',
            streetSample: addrComponents.street?.slice(0, 80) || ''
          });
        }
      }

      // Fallback: exact substring match on full address
      if (!anchorMatchedFields.includes('businessAddress')) {
        const addrCore = businessAddress.trim().slice(0, 25).toLowerCase();
        if (addrCore.length >= 5 && text.toLowerCase().includes(addrCore)) {
          anchorMatchedFields.push('businessAddress');
          wfLog('info', '[WATERFALL] Level 3 exact address match', {
            domain: 'parser-triage',
            waterfallLevel: 3,
            identityMethod: 'ANCHOR_SIGNAL',
            detail: 'businessAddress',
            addrCore
          });
        }
      }
    }

    // Company name matching (fuzzy with normalization)
    if (companyName && typeof companyName === 'string') {
      const normalizedName = normalizeCompanyName(companyName);

      if (normalizedName.length >= 3) {
        // Try fuzzy matching on normalized company name
        const fuzzyMatchFound = fuzzyMatch(normalizedName, text, {
          threshold: 0.85, // 85% similarity for company names
          minLength: 3
        });
        if (fuzzyMatchFound) {
          anchorMatchedFields.push('companyName');
          wfLog('info', '[WATERFALL] Level 3 fuzzy company name match', {
            domain: 'parser-triage',
            waterfallLevel: 3,
            identityMethod: 'ANCHOR_SIGNAL',
            detail: 'companyName',
            normalizedNameSample: normalizedName.slice(0, 80)
          });
        }

        // Fallback: exact substring match on original name
        if (!anchorMatchedFields.includes('companyName')) {
          const nameCore = companyName.trim().toLowerCase();
          if (text.toLowerCase().includes(nameCore)) {
            anchorMatchedFields.push('companyName');
            wfLog('info', '[WATERFALL] Level 3 exact company name match', {
              domain: 'parser-triage',
              waterfallLevel: 3,
              identityMethod: 'ANCHOR_SIGNAL',
              detail: 'companyName',
              nameCore
            });
          }
        }
      }
    }

    if (anchorMatchedFields.length > 0) {
      // Applicant identity confirmed — scan full text (not just header) for bank brand
      const { name: anchoredBankName } = this._extractBankNameWithConfidence(text);
      if (anchoredBankName) {
        wfLog('info', '[WATERFALL] Level 3 Anchor-Lock resolved bank brand', {
          domain: 'parser-triage',
          waterfallLevel: 3,
          identityMethod: 'ANCHOR_LOCK',
          anchorMatchedFields,
          bankName: anchoredBankName,
          confidence: 'HIGH'
        });
        return { bankName: anchoredBankName, confidence: 'HIGH', identityMethod: 'ANCHOR_LOCK', anchorMatchedFields };
      }
      // Anchor confirmed the applicant but brand still unresolved — still human-required
      wfLog('info', '[WATERFALL] Level 3 Anchor-Lock applicant only (bank unresolved)', {
        domain: 'parser-triage',
        waterfallLevel: 3,
        identityMethod: 'ANCHOR_PARTIAL',
        anchorMatchedFields,
        confidence: 'LOW'
      });
    }

    // ── Level 3.5: Text-Brand-Lock via header brand fingerprint ───────────────
    const { name: brandBankName, confidence: brandConfidence } =
      this._extractBankNameWithConfidence(text);
    if (brandBankName && brandConfidence === 'HIGH') {
      wfLog('info', '[WATERFALL] Level 3.5 Text-Brand-Lock', {
        domain: 'parser-triage',
        waterfallLevel: 3.5,
        identityMethod: 'TEXT_BRAND_LOCK',
        bankName: brandBankName,
        confidence: 'HIGH'
      });
      return {
        bankName: brandBankName,
        confidence: 'HIGH',
        identityMethod: 'TEXT_BRAND_LOCK'
      };
    }

    // ── Level 4: Human-in-the-Loop ────────────────────────────────────────────
    wfLog('info', '[WATERFALL] Level 4 human confirmation required', {
      domain: 'parser-triage',
      waterfallLevel: 4,
      identityMethod: 'HUMAN_REQUIRED',
      confidence: 'LOW'
    });
    return { bankName: null, confidence: 'LOW', identityMethod: 'HUMAN_REQUIRED' };
  }

  _detectBankStatementIndicators(headerText) {
    if (!headerText) return { isStatement: false, bankName: null, accountNumber: null };

    const statementKeywords = [
      /\bstatement\b/i,
      /\bbank\b/i,
      /\bcredit union\b/i,
      /\bcheck(?:ing|s)?\b/i,
      /\bsavings?\b/i,
      /\baccount\b.*\bbalance\b/i,
      /\bbeginning balance\b/i,
      /\bending balance\b/i,
      /\bopening balance\b/i,
      /\bclosing balance\b/i,
      /\bmember\s+fdic\b/i,
      /\bequal housing\b/i,
      /\brouting\s+(?:number|#)\b/i,
      /\btransaction\s+(?:date|detail|history)\b/i,
      /\bdeposit\b/i,
      /\bwithdrawal\b/i,
    ];

    const matchCount = statementKeywords.filter(p => p.test(headerText)).length;
    const isStatement = matchCount >= 2;
    const { name: bankName, confidence: bankNameConfidence } = this._extractBankNameWithConfidence(headerText);
    const accountNumber = this._extractAccountNumberGeneric(headerText);

    return { isStatement, bankName, bankNameConfidence, accountNumber };
  }

  _extractObjectResponse(rawResponse) {
    if (!rawResponse) return null;
    if (typeof rawResponse === 'object') {
      if (rawResponse.data && typeof rawResponse.data === 'object') return rawResponse.data;
      if (rawResponse.result && typeof rawResponse.result === 'object') return rawResponse.result;
      return rawResponse;
    }
    if (typeof rawResponse === 'string') {
      const jsonMatch = rawResponse.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try { return JSON.parse(jsonMatch[0]); } catch { return null; }
      }
    }
    return null;
  }

  _normalizeDocumentType(docType) {
    if (!docType || typeof docType !== 'string') return null;
    return docType.trim().toUpperCase();
  }

  _extractStatementPeriodFromHeader(text) {
    if (!text || typeof text !== 'string') return null;

    const patterns = [
      /(?:statement\s+period|period(?:\s+of\s+coverage)?)[:\s]+(.+?)\s*[-–—]\s*(.+?)(?:\r?\n|$)/i,
      /(?:from|account\s+activity)[:\s]+(.+?)\s*[-–—]\s*(.+?)(?:\r?\n|$)/i,
      /(\d{1,2}[-/]\d{1,2}[-/]\d{2,4})\s*(?:through|to|-|–)\s*(\d{1,2}[-/]\d{1,2}[-/]\d{2,4})/i,
      /([A-Z][a-z]+\s+\d{1,2},?\s+\d{4})\s*(?:through|to|-|–)\s*([A-Z][a-z]+\s+\d{1,2},?\s+\d{4})/i,
    ];

    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) {
        const start = this._parseFlexibleDate(match[1].trim());
        const end = this._parseFlexibleDate(match[2].trim());
        if (start && end) {
          return this._buildStatementPeriod(start, end);
        }
      }
    }
    return null;
  }

  _parseFlexibleDate(text) {
    if (!text || typeof text !== 'string') return null;

    // Numeric: MM/DD/YYYY or MM-DD-YYYY
    const numericMatch = text.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})$/);
    if (numericMatch) {
      const [, m, d, y] = numericMatch;
      const year = y.length === 2 ? Number(`20${y}`) : Number(y);
      const date = new Date(year, Number(m) - 1, Number(d));
      if (!isNaN(date.getTime())) return date;
    }

    // Named: "January 1, 2024" or "January 1 2024"
    const namedMatch = text.match(/^([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})$/);
    if (namedMatch) {
      const [, mon, day, year] = namedMatch;
      const date = new Date(`${mon} ${day}, ${year}`);
      if (!isNaN(date.getTime())) return date;
    }

    // EU: "1 January 2024"
    const euMatch = text.match(/^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$/);
    if (euMatch) {
      const [, day, mon, year] = euMatch;
      const date = new Date(`${mon} ${day}, ${year}`);
      if (!isNaN(date.getTime())) return date;
    }

    return null;
  }

  _buildStatementPeriod(start, end) {
    if (!start || !end) return null;
    const startDate = start instanceof Date ? start : new Date(start);
    const endDate = end instanceof Date ? end : new Date(end);
    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) return null;
    const days = Math.round((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
    return { start: startDate, end: endDate, days };
  }

  /**
   * Extracts the bank name from text and signals how confident the match is.
   * HIGH  = exact brand fingerprint found (domain, legal name, registered mark)
   * LOW   = generic keyword match only — caller should request human confirmation
   */
  _extractBankNameWithConfidence(text) {
    if (!text || typeof text !== 'string') return { name: null, confidence: 'LOW' };

    // Focus on the header window (first 2000 chars) to avoid matching transaction rows
    const headerText = text.slice(0, 2000);

    // ── HIGH-confidence anchors — exact brand fingerprints ─────────────────
    const highConfidenceAnchors = [
      { name: 'Chase',                     pattern: /CHASE\s*[®©R]|JPMorgan Chase Bank|chase\.com/i },
      { name: 'Regions Bank',              pattern: /Regions Log In|Log on to regions\.com|regions\.com/i },
      { name: 'Bank of America',           pattern: /bankofamerica\.com|Bank of America,\s*N\.A\./i },
      { name: 'Wells Fargo',               pattern: /wellsfargo\.com|Wells Fargo Bank,\s*N\.A\./i },
      { name: 'Navy Federal Credit Union', pattern: /navyfederal\.org|Navy Federal Credit Union/i },
      { name: 'USAA',                      pattern: /usaa\.com|USAA Federal Savings/i },
      { name: 'Citibank',                  pattern: /citi\.com|Citibank,\s*N\.A\./i },
      { name: 'U.S. Bank',                 pattern: /usbank\.com|U\.S\. Bancorp|U\.S\. Bank National Association/i },
      { name: 'PNC Bank',                  pattern: /pnc\.com|PNC Bank,\s*National Association/i },
      { name: 'TD Bank',                   pattern: /tdbank\.com|TD Bank,\s*N\.A\./i },
      { name: 'Capital One',               pattern: /capitalone\.com|Capital One,\s*N\.A\./i },
      { name: 'Truist',                    pattern: /truist\.com|Truist Bank/i },
      { name: 'Fifth Third Bank',          pattern: /53\.com|Fifth Third Bank/i },
      { name: 'KeyBank',                   pattern: /key\.com|KeyBank National Association/i },
      { name: 'Ally Bank',                 pattern: /ally\.com|Ally Bank/i },
    ];

    for (const anchor of highConfidenceAnchors) {
      if (anchor.pattern.test(headerText)) {
        return { name: anchor.name, confidence: 'HIGH' };
      }
    }

    // ── LOW-confidence — generic keyword match ──────────────────────────────
    const knownBanks = [
      { name: 'Navy Federal Credit Union', pattern: /\b(Navy Federal Credit Union)\b/i },
      { name: 'Chase',                     pattern: /\b(Chase Bank|JPMorgan Chase)\b/i },
      { name: 'Bank of America',           pattern: /\b(Bank of America)\b/i },
      { name: 'Wells Fargo',               pattern: /\b(Wells Fargo)\b/i },
      { name: 'Citibank',                  pattern: /\b(Citibank|Citi Bank)\b/i },
      { name: 'Regions Bank',              pattern: /\b(Regions Bank|Regions Financial)\b/i },
      { name: 'U.S. Bank',                 pattern: /\b(U\.?S\.? Bank|USBancorp)\b/i },
      { name: 'PNC Bank',                  pattern: /\b(PNC Bank|PNC Financial)\b/i },
      { name: 'TD Bank',                   pattern: /\b(TD Bank)\b/i },
      { name: 'Capital One',               pattern: /\b(Capital One)\b/i },
      { name: 'Truist',                    pattern: /\b(Truist)\b/i },
      { name: 'Fifth Third Bank',          pattern: /\b(Fifth Third Bank)\b/i },
      { name: 'KeyBank',                   pattern: /\b(KeyBank|Key Bank)\b/i },
      { name: 'Ally Bank',                 pattern: /\b(Ally Bank)\b/i },
      { name: 'USAA',                      pattern: /\b(USAA)\b/i },
    ];

    for (const bank of knownBanks) {
      if (bank.pattern.test(headerText)) return { name: bank.name, confidence: 'LOW' };
    }

    // Generic fallback: "[Name] Bank" or "[Name] Credit Union" in the header
    const genericMatch = headerText.match(/\b([A-Z][a-zA-Z\s&.'-]{1,40}(?:Bank|Credit Union|Savings|Financial|Federal))\b/);
    if (genericMatch) return { name: genericMatch[1].trim(), confidence: 'LOW' };

    return { name: null, confidence: 'LOW' };
  }

  /** Convenience wrapper — returns name only. Preserves all existing callers. */
  _extractBankNameGeneric(text) {
    return this._extractBankNameWithConfidence(text).name;
  }

  _extractAccountNumberGeneric(text) {
    if (!text || typeof text !== 'string') return null;

    // Regions Bank often uses XX-XXXX-XXXX or simple Account: 123456789
    // Also matching Patterns like "Account Number Ending In ####"
    const patterns = [
      /[Aa]ccount\s*(?:[Nn]umber|Id|No|#)?[:\s#]*([Xx*•·]{0,10}\s?\d{4,17})\b/i,
      /[Aa]cct\.?\s*(?:[Nn]o\.?|#)?[:\s]*([Xx*•·]{0,10}\s?\d{4,17})\b/i,
      /(?:Ending In|Ending With|Ending)[:\s]*([Xx*•·]{0,6}\s?\d{4})\b/i,
      /\b(\d{2}-\d{4}-\d{4})\b/, // Regions specific format
      /\b([Xx*•·]{4}\s?\d{4,12})\b/, // Purely masked format like XXXX 1234
      /Account\s+([0-9]{9,12})\b/i, // Generic numeric account
      /(?:Acct|Account)\s*#\s*([0-9]{4,15})\b/i // Account # check
    ];

    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match && match[1]) {
        const cleaned = match[1].replace(/\s+/g, '').trim();
        // Prevent matching common years or small integers if not prefixed with Account/Acct
        if (cleaned.length < 5 && !/^[Xx*•·]/.test(cleaned)) continue;
        return cleaned;
      }
    }
    return null;
  }

  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Strip statement date prefixes glued to amounts (Regions: "01/3117,238.53" → "17,238.53").
   * @param {string} line
   * @returns {string}
   */
  static stripDatePrefixForAmountLine(line) {
    if (!line || typeof line !== 'string') return line || '';
    let rest = line.trim();

    const fullDate = rest.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})\s*(.*)$/);
    if (fullDate?.[4] != null && String(fullDate[4]).trim() !== '') {
      return String(fullDate[4]).trim();
    }

    const glued = rest.match(/^(\d{1,2})[-/](\d{2})(\d{1,2},\d{3}\.\d{2}.*)$/);
    if (glued?.[3]) {
      return glued[3];
    }

    rest = rest.replace(/^\d{1,2}[-/]\d{2}(?=\d)/, '');
    rest = rest.replace(/^\d{1,2}[-/]\d{2}\s*/, '');
    return rest;
  }

  static _normalizeAmount(value) {
      // Use the new pickNumeric utility to prevent routing number capture
      return pickNumeric(value, {
        maxAmount: getAbsurdityThreshold(),
        allowNegative: true,
        strictDecimal: true
      });
  }
}

export const pdfParserService = new PDFParserService();

export default pdfParserService;
