/**
 * Deterministic bank-statement parse using stored InstitutionalProfile template mapping.
 * Single async boundary (pdf-parse); row logic stays synchronous thereafter.
 * @license Copyright (c) 2025 Shift 4 Financial INC
 */

import pdfParse from 'pdf-parse';
import pdfParserService from './pdfParserService.js';
import { validateReconciliation } from './templateGraduationService.js';
import { normalizeTransactionForLedger } from '../utils/transactionNormalization.js';
import logger from '../utils/logger.js';
import { TemplateMismatchError, ValidationError } from '../utils/errors.js';
import {
  buildDealIdentity,
  getAbsurdityThreshold,
  sanitizeTransactionsForMacro
} from '../utils/amountSanityGuardrails.js';
import { stitchStatement } from './statementStitcher.js';

export { TemplateMismatchError } from '../utils/errors.js';

/**
 * Normalize template mapping to match coerceLayoutMapping defaults.
 * @param {object} template
 */
export function normalizeLayoutTemplate(template) {
  const t = template && typeof template === 'object' ? template : {};
  const ha = t.headerAnchors && typeof t.headerAnchors === 'object' ? t.headerAnchors : {};
  const cm = t.columnMapping && typeof t.columnMapping === 'object' ? t.columnMapping : {};
  const transactionSections = Array.isArray(t.transactionSections)
    ? t.transactionSections
        .map((sec) => {
          if (!sec || typeof sec !== 'object') return null;
          const tableStart = String(sec.tableStart ?? sec.start ?? '').trim();
          if (!tableStart) return null;
          return {
            label: String(sec.label ?? '').trim(),
            tableStart,
            tableEnd: String(sec.tableEnd ?? sec.end ?? '').trim()
          };
        })
        .filter(Boolean)
    : null;

  return {
    ...t,
    headerAnchors: {
      tableStart: String(ha.tableStart ?? ''),
      tableEnd: String(ha.tableEnd ?? '')
    },
    ...(transactionSections?.length ? { transactionSections } : {}),
    columnMapping: {
      dateCol: Number.isFinite(Number(cm.dateCol)) ? Number(cm.dateCol) : 0,
      descCol: Number.isFinite(Number(cm.descCol)) ? Number(cm.descCol) : 1,
      amountCol: Number.isFinite(Number(cm.amountCol)) ? Number(cm.amountCol) : 2,
      balanceCol:
        cm.balanceCol === null || cm.balanceCol === undefined || cm.balanceCol === ''
          ? null
          : Number.isFinite(Number(cm.balanceCol))
            ? Number(cm.balanceCol)
            : null,
      debitCol: Number.isFinite(Number(cm.debitCol ?? cm.debitIdx))
        ? Number(cm.debitCol ?? cm.debitIdx)
        : null,
      creditCol: Number.isFinite(Number(cm.creditCol ?? cm.creditIdx))
        ? Number(cm.creditCol ?? cm.creditIdx)
        : null
    },
    mathPattern: (() => {
      const mapping = {
        debitCol: Number.isFinite(Number(cm.debitCol ?? cm.debitIdx))
          ? Number(cm.debitCol ?? cm.debitIdx)
          : null,
        creditCol: Number.isFinite(Number(cm.creditCol ?? cm.creditIdx))
          ? Number(cm.creditCol ?? cm.creditIdx)
          : null
      };
      let pattern = String(t.mathPattern || 'MINUS_PREFIX').toUpperCase().replace(/\s+/g, '_');
      if (pattern === 'DEBIT_CREDIT_SEPARATE' && (mapping.debitCol == null || mapping.creditCol == null)) {
        pattern = 'MINUS_PREFIX';
      }
      return pattern;
    })()
  };
}

/**
 * Regex-only opening/closing (same fallback idea as pdfParserService._extractBalances, no AI).
 * @param {string} fullText
 * @param {{ parseAmount: (s: string) => number | null }} parser
 */
export function extractBalancesDeterministic(fullText, parser) {
  let openingBalance = null;
  let closingBalance = null;
  const parseVal = (raw) => {
    const n = parser.parseAmount(String(raw));
    if (typeof n !== 'number' || !Number.isFinite(n) || n > getAbsurdityThreshold()) return null;
    return n;
  };

  if (!fullText || typeof fullText !== 'string') {
    return { opening: 0, closing: 0 };
  }

  const closingBalancePattern =
    /(?:Ending Balance|Closing Balance)[\s\S]{0,50}?(?:^|\s)\$?\s*((?:\d{1,3}(?:,\d{3})*|\d+)\.\d{2})(?!\d)/im;
  const closingMatch = fullText.match(closingBalancePattern);
  if (closingMatch) {
    closingBalance = parseVal(closingMatch[1]);
  }

  const openingBalancePattern =
    /(?:Beginning Balance|Opening Balance|Previous Balance)[\s\S]{0,50}?(?:^|\s)\$?\s*((?:\d{1,3}(?:,\d{3})*|\d+)\.\d{2})(?!\d)/im;
  const openingMatch = fullText.match(openingBalancePattern);
  if (openingMatch) {
    openingBalance = parseVal(openingMatch[1]);
  }

  return {
    opening: openingBalance ?? 0,
    closing: closingBalance ?? 0
  };
}

/**
 * Column-mapped extraction when debit and credit live in separate columns.
 * @param {string} rawText
 * @param {object} layoutTemplate normalized
 */
async function extractTransactionsDebitCreditSeparate(svc, rawText, layoutTemplate) {
  const cm = layoutTemplate.columnMapping;
  const debitCol = cm.debitCol;
  const creditCol = cm.creditCol;
  const parser = svc.bankParsers.get('DEFAULT');
  const defaultYear = svc._detectStatementYear(rawText);
  const lines = rawText.split(/\r?\n/);
  const transactions = [];
  let lastTransaction = null;

  const maxCol = Math.max(
    cm.dateCol,
    cm.descCol,
    debitCol,
    creditCol,
    cm.balanceCol == null ? -1 : cm.balanceCol
  );

  for (let index = 0; index < lines.length; index += 1) {
    const rawLine = lines[index];
    const line = rawLine.trim();
    if (!line) continue;

    if (svc._isNonTransactionLine(line)) {
      lastTransaction = null;
      continue;
    }

    const tokens = svc._splitLineIntoColumns(line);
    if (tokens.length <= maxCol) {
      if (lastTransaction && !svc._looksLikeSectionHeader(line)) {
        lastTransaction.description = `${lastTransaction.description} ${line}`.trim();
      } else {
        lastTransaction = null;
      }
      continue;
    }

    const dateTok = tokens[cm.dateCol];
    const descTok = tokens[cm.descCol] ?? '';
    const debitTok = tokens[debitCol] || '';
    const creditTok = tokens[creditCol] || '';
    const dVal = svc._parseSingleMoneyToken(debitTok);
    const cVal = svc._parseSingleMoneyToken(creditTok);

    let signedAmount = null;
    if (typeof dVal === 'number' && dVal !== 0) signedAmount = -Math.abs(dVal);
    else if (typeof cVal === 'number' && cVal !== 0) signedAmount = Math.abs(cVal);

    if (signedAmount === null) {
      if (lastTransaction && !svc._looksLikeSectionHeader(line)) {
        lastTransaction.description = `${lastTransaction.description} ${line}`.trim();
      } else {
        lastTransaction = null;
      }
      continue;
    }

    const syntheticLine = `${dateTok} ${signedAmount}`.trim();
    const dateValue = svc._parseDateFromLine(syntheticLine, parser, defaultYear);
    let amountInfo = svc._parseAmountFromLine(syntheticLine, parser);

    if (!dateValue || !amountInfo) {
      if (lastTransaction && !svc._looksLikeSectionHeader(line)) {
        lastTransaction.description = `${lastTransaction.description} ${line}`.trim();
      } else {
        lastTransaction = null;
      }
      continue;
    }

    if (cm.balanceCol != null && cm.balanceCol !== debitCol && cm.balanceCol !== creditCol && tokens.length > cm.balanceCol) {
      const balNum = svc._parseSingleMoneyToken(tokens[cm.balanceCol]);
      if (typeof balNum === 'number' && Number.isFinite(balNum)) {
        amountInfo = { ...amountInfo, balance: balNum };
      }
    }

    const description = String(descTok).trim() || svc._parseDescriptionFromLine(syntheticLine, parser);

    const transaction = normalizeTransactionForLedger({
      date: dateValue,
      description,
      amount: amountInfo.amount,
      type: amountInfo.type,
      balance: amountInfo.balance,
      lineNumber: index + 1,
      rawLine
    });

    transactions.push(transaction);
    lastTransaction = transaction;
  }

  return transactions;
}

/**
 * @param {Buffer} pdfBuffer
 * @param {object} template InstitutionalProfile template.mapping (plus optional mathPattern, headerAnchors)
 * @param {{ rtn?: string, templateVersion?: number, openingBalance?: number, closingBalance?: number }} [meta]
 * @returns {Promise<object>} parseResult-shaped object compatible with validateReconciliation
 */
export async function parseWithTemplate(pdfBuffer, template, meta = {}) {
  const { rtn, templateVersion } = meta;
  const cleanedRtn = rtn != null ? String(rtn).replace(/\D/g, '') : '';

  if (!Buffer.isBuffer(pdfBuffer) && !(pdfBuffer instanceof Uint8Array)) {
    throw new ValidationError('parseWithTemplate: pdfBuffer must be a Buffer');
  }

  const data = await pdfParse(pdfBuffer);
  const fullText = data?.text || '';
  const stitcher = stitchStatement(fullText);
  const typeBText =
    stitcher.typeB.combinedText?.trim().length > 0 ? stitcher.typeB.combinedText : fullText;
  const layoutTemplate = normalizeLayoutTemplate(template);

  const sections = Array.isArray(layoutTemplate.transactionSections)
    ? layoutTemplate.transactionSections
    : [];
  const defaultYear = pdfParserService._detectStatementYear(fullText);

  const mathPattern = String(layoutTemplate.mathPattern || 'MINUS_PREFIX').toUpperCase();
  const cm = layoutTemplate.columnMapping;
  const hasDebitCreditCols =
    mathPattern === 'DEBIT_CREDIT_SEPARATE' &&
    cm.debitCol != null &&
    cm.creditCol != null &&
    Number.isFinite(cm.debitCol) &&
    Number.isFinite(cm.creditCol);

  const extractFromText = async (sliced, sectionLabel = null) => {
    let txns;
    if (hasDebitCreditCols) {
      txns = await extractTransactionsDebitCreditSeparate(pdfParserService, sliced, layoutTemplate);
    } else {
      const effectiveLayout =
        mathPattern === 'DEBIT_CREDIT_SEPARATE'
          ? { ...layoutTemplate, mathPattern: 'MINUS_PREFIX' }
          : layoutTemplate;

      if (mathPattern === 'DEBIT_CREDIT_SEPARATE') {
        logger.warn(
          '[RUNNER] DEBIT_CREDIT_SEPARATE without debitCol/creditCol; using MINUS_PREFIX fallback on amountCol',
          {
            service: 'bank-statement-analyzer',
            timestamp: new Date().toISOString(),
            rtn: cleanedRtn || undefined,
            templateVersion: templateVersion ?? undefined
          }
        );
      }

      txns = await pdfParserService._extractTransactionsColumnMapped(
        sliced,
        pdfParserService.bankParsers.get('DEFAULT'),
        { layoutTemplate: effectiveLayout, defaultYear, stitcher }
      );
    }
    if (sectionLabel) {
      txns = txns.map((t) => ({ ...t, sectionLabel }));
    }
    return txns;
  };

  let transactions = [];

  const typeBPages =
    stitcher.typeB.pages?.length > 0
      ? stitcher.typeB.pages
      : [{ pageIndex: 1, totalPages: null, text: typeBText }];

  if (sections.length > 0) {
    for (const page of typeBPages) {
      for (const sec of sections) {
        const slice = pdfParserService._applyHeaderAnchorsMulti(page.text, {
          headerAnchors: layoutTemplate.headerAnchors,
          transactionSections: [sec]
        });
        const label = String(sec.label || sec.tableStart || '').trim() || null;
        const part = await extractFromText(slice, label);
        transactions.push(...part);
      }
    }
    if (transactions.length === 0) {
      for (const page of typeBPages) {
        const sliced = pdfParserService._applyHeaderAnchorsMulti(page.text, layoutTemplate);
        transactions.push(...(await extractFromText(sliced)));
      }
    }
  } else {
    for (const page of typeBPages) {
      const sliced = pdfParserService._applyHeaderAnchorsMulti(page.text, layoutTemplate);
      transactions.push(...(await extractFromText(sliced)));
    }
  }

  const parser = pdfParserService.bankParsers.get('DEFAULT');
  let openingBalance;
  let closingBalance;
  const printed = stitcher.typeA.printed;
  if (printed.opening != null) openingBalance = printed.opening;
  if (printed.closing != null) closingBalance = printed.closing;
  if (
    openingBalance == null &&
    typeof meta.openingBalance === 'number' &&
    Number.isFinite(meta.openingBalance)
  ) {
    openingBalance = meta.openingBalance;
  }
  if (
    closingBalance == null &&
    typeof meta.closingBalance === 'number' &&
    Number.isFinite(meta.closingBalance)
  ) {
    closingBalance = meta.closingBalance;
  }
  if (openingBalance == null || closingBalance == null) {
    const bal = extractBalancesDeterministic(stitcher.typeA.text || fullText, parser);
    if (openingBalance == null) openingBalance = bal.opening;
    if (closingBalance == null) closingBalance = bal.closing;
  }

  const parseResult = {
    success: true,
    transactions,
    openingBalance,
    closingBalance,
    balances: {
      opening: openingBalance,
      closing: closingBalance
    },
    metadata: {
      usedLayoutTemplate: true,
      deterministicRunner: true,
      pageCount: data?.numpages,
      rtn: cleanedRtn.length === 9 ? cleanedRtn : null,
      stitcher: {
        pageCount: stitcher.pageCount,
        printedSummary: stitcher.typeA.printed,
        footer: stitcher.typeC.footer
      }
    },
    stitcher
  };

  const dealIdentity = buildDealIdentity({
    rtn: cleanedRtn,
    ...(meta.identitySources && typeof meta.identitySources === 'object' ? meta.identitySources : {})
  });
  const { accepted } = sanitizeTransactionsForMacro(transactions, dealIdentity);
  parseResult.transactions = accepted;

  const recon = validateReconciliation(parseResult);

  if (!recon.ok) {
    logger.error(
      `[RUNNER] Deterministic parse failed for RTN ${cleanedRtn || 'unknown'}. Checksum mismatch detected.`,
      {
        service: 'bank-statement-analyzer',
        timestamp: new Date().toISOString(),
        rtn: cleanedRtn || undefined,
        templateVersion: templateVersion ?? undefined,
        transactionCount: transactions.length,
        reason: recon.reason,
        delta: recon.delta
      }
    );
    throw new TemplateMismatchError(
      `Template checksum failed: ${recon.reason || 'opening + deposits − withdrawals ≠ closing'}`,
      recon
    );
  }

  logger.info(
    `[RUNNER] Successfully parsed ${transactions.length} transactions using template version ${templateVersion ?? 'n/a'} for RTN ${cleanedRtn || 'n/a'}`,
    {
      service: 'bank-statement-analyzer',
      timestamp: new Date().toISOString(),
      rtn: cleanedRtn || undefined,
      templateVersion: templateVersion ?? undefined,
      transactionCount: transactions.length
    }
  );

  return parseResult;
}
