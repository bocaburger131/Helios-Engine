/**
 * Macro batch: one Gemini layout teach per RTN group + local pdf-parse re-parse (no per-file vision rows).
 */

import pdfParse from 'pdf-parse';
import {
  learnTemplateLayout,
  coerceLayoutMapping,
  extractTransactionRows,
  resolveLlmApiKey,
  rowFallbackEnabled,
  resolveActiveLlm
} from './llm/aiLayoutService.js';
import {
  applyParseQualityPipeline,
  attachChecksumDeltaProbe,
  attachParseOutcomeFlags,
  summarizeBatchParseOutcomes
} from '../utils/statementParseQuality.js';
import { buildParsingBleedAlert } from '../utils/amountSanityGuardrails.js';
import { buildReconciliationMismatchAlert } from './templateGraduationService.js';
import { ensureInstitutionalProfileForRtn } from './bankEnrichmentService.js';
import InstitutionalProfile from '../models/InstitutionalProfile.js';
import { RTN_BANK_MAP } from '../config/bankIdentifiers.js';
import logger from '../utils/logger.js';
import { clearVisionLayoutCacheForRtn } from './visionLayoutCacheService.js';
import { setBatchProgress } from './batchProgressStore.js';
import {
  persistLearningTemplate,
  getLatestLearnableTemplate
} from './institutionalTemplatePersist.js';
import { isDigitalPdfMode } from './extraction/extractionModeRouter.js';
import {
  prepareLayoutForDigitalApply,
  extractTypeBTextFromBuffer,
  shouldRejectStoredMongoTemplate
} from './extraction/templateDigitalValidator.js';
import { detectBankName, fastPage1Text } from '../utils/bankDetector.js';
import { shouldReuseLayoutWithoutGemini } from './extraction/layoutFingerprintService.js';
import { triageLayoutMismatch, createRelationship } from './institutionTriageService.js';
import {
  pdfPlumberEnabled,
  extractTransactionsFromPdfBuffer
} from './extraction/pdfPlumberService.js';
import { isLedgerInflow } from '../utils/transactionNormalization.js';
import { analyzeMismatch } from './aiDiagnosticService.js';
import { applyDiagnosticCorrection } from '../utils/checksumAutoCorrection.js';

/** Strict integrity gate — not overridable below 0.8 via env. */
export const MACRO_CHECKSUM_MIN_OK_RATIO = 0.8;

export function computeBatchChecksumStats(parsedStatements) {
  const total = parsedStatements.length;
  const okCount = parsedStatements.filter((s) => s.parseQuality === 'OK').length;
  const ratio = total > 0 ? okCount / total : 0;
  return { okCount, ratio, total };
}

/**
 * Prefer explicit parse outcomes over treating HTTP 202 as success.
 * @param {Array<object>} parsedStatements
 */
export function resolveBatchHttpStatus(parsedStatements) {
  return summarizeBatchParseOutcomes(parsedStatements);
}

const REGIONS_MS_RTN = '062001186';

function batchGeminiEnabled() {
  if (!resolveLlmApiKey()) return false;
  const v = process.env.BATCH_GEMINI_TEACHER;
  if (v === 'false' || v === '0') return false;
  return true;
}

/** Batch macro path: per-file vision row extraction (Plan C; default on, opt out with false/0). */
export function batchUseVisionRowFallback() {
  const v = process.env.BATCH_USE_VISION_ROW_FALLBACK;
  if (v === 'false' || v === '0') return false;
  return true;
}

/** Diagnostic AI Rescue master switch (default on; replaces brute-force row extraction). */
export function aiDiagnosticRescueEnabled() {
  if (
    process.env.DISABLE_AI_RESCUER === 'true' ||
    process.env.DISABLE_AI_RESCUER === '1'
  ) {
    return false;
  }
  const v = process.env.AI_DIAGNOSTIC_RESCUE_ENABLED;
  if (v === 'false' || v === '0') return false;
  return true;
}

/** Dev Console simulation: force ProcessingRun HITL even when checksums pass. */
export function forceHitlRoutingEnabled() {
  return (
    process.env.FORCE_HITL_ROUTING === 'true' ||
    process.env.FORCE_HITL_ROUTING === '1'
  );
}

/**
 * Deterministic programmatic anomaly detection (e.g. COLUMN_FLIP).
 * Checks mathematical reconciliation cross-matches first, then falls back
 * to pdfplumber pageTelemetry patterns.
 * No AI call needed for these clear-cut patterns.
 *
 * @param {object} stmt
 * @returns {{ diagnosis, confidenceScore, affectedRows, explanation } | null}
 */
/** Exported for unit tests. */
export function detectProgrammaticAnomalies(stmt) {
  const breakdown = stmt.checksumDeltaProbe?.reconciliationBreakdown || null;
  const parsedDeposits = breakdown?.deposits || 0;
  const parsedWithdrawals = breakdown?.withdrawals || 0;

  // 1. Transaction-level mathematical check for COLUMN_FLIP
  const printedDepRaw = stmt.stitcher?.typeA?.printed?.totalDeposits ?? 
                        stmt.parseResult?.metadata?.stitcher?.printedSummary?.totalDeposits;
  const printedWithRaw = stmt.stitcher?.typeA?.printed?.totalWithdrawals ?? 
                         stmt.parseResult?.metadata?.stitcher?.printedSummary?.totalWithdrawals;

  if (printedDepRaw != null && printedWithRaw != null) {
    const printedDeposits = Number(printedDepRaw);
    const printedWithdrawals = Number(printedWithRaw);
    
    if (Number.isFinite(printedDeposits) && Number.isFinite(printedWithdrawals)) {
      const depDiff = Math.abs(parsedDeposits - printedWithdrawals);
      const withDiff = Math.abs(parsedWithdrawals - printedDeposits);
      
      // If parsed deposits match printed withdrawals, and parsed withdrawals match printed deposits
      if (depDiff < 1.0 && withDiff < 1.0) {
        return {
          diagnosis: 'COLUMN_FLIP',
          confidenceScore: 0.95,
          affectedRows: [],
          explanation: `Mathematical anomaly: parsed deposits ($${parsedDeposits.toFixed(2)}) match printed withdrawals and parsed withdrawals ($${parsedWithdrawals.toFixed(2)}) match printed deposits.`
        };
      }

      // MISALIGNED_COLUMNS: parsed aggregates massively exceed printed totals (balance column bleed)
      if (printedDeposits > 0 && parsedDeposits > printedDeposits * 1.5) {
        const ratio = parsedDeposits / printedDeposits;
        return {
          diagnosis: 'MISALIGNED_COLUMNS',
          confidenceScore: Math.min(0.98, 0.75 + ratio * 0.05),
          affectedRows: [],
          explanation:
            `Parsed deposits ($${parsedDeposits.toFixed(2)}) are ${ratio.toFixed(1)}x printed deposits ($${printedDeposits.toFixed(2)}). ` +
            'Likely running-balance or check-number column misread as transaction amounts.'
        };
      }
      if (printedWithdrawals > 0 && parsedWithdrawals > printedWithdrawals * 1.5) {
        const ratio = parsedWithdrawals / printedWithdrawals;
        return {
          diagnosis: 'MISALIGNED_COLUMNS',
          confidenceScore: Math.min(0.98, 0.75 + ratio * 0.05),
          affectedRows: [],
          explanation:
            `Parsed withdrawals ($${parsedWithdrawals.toFixed(2)}) are ${ratio.toFixed(1)}x printed withdrawals ($${printedWithdrawals.toFixed(2)}). ` +
            'Likely running-balance column misread as transaction amounts.'
        };
      }
    }
  }

  // 2. Original telemetry-based check for COLUMN_FLIP
  const pageTelemetry = stmt.parseResult?.metadata?.pageTelemetry ?? [];
  if (Array.isArray(pageTelemetry) && pageTelemetry.length > 0) {
    const depositPages = pageTelemetry.filter(p => p.sectionId === 'deposits' && p.txnRows > 0);
    if (depositPages.length > 0) {
      const totalTxnRows = depositPages.reduce((s, p) => s + p.txnRows, 0);
      const totalDebitRows = depositPages.reduce((s, p) => s + p.debitRows, 0);
      const debitRatio = totalTxnRows > 0 ? totalDebitRows / totalTxnRows : 0;
      
      if (debitRatio >= 0.8 && parsedDeposits === 0) {
        return {
          diagnosis: 'COLUMN_FLIP',
          confidenceScore: 0.95,
          affectedRows: [],
          explanation:
            `Deposits section has ${Math.round(debitRatio * 100)}% debit rows (${totalDebitRows}/${totalTxnRows}) ` +
            `but reconciliation shows parsedDeposits=${parsedDeposits}. Programmatic column-flip detected.`
        };
      }
    }
  }

  return null;
}

/**
 * Forensic checksum rescue: diagnose the anomaly on already-parsed rows, then
 * programmatically auto-correct (COLUMN_FLIP). Never brute-force extracts rows.
 * Leaves stmt.aiDiagnostic attached for HITL when not auto-correctable.
 * @returns {Promise<boolean>} true when the statement now reconciles
 */
async function runDiagnosticRescue(stmt, ctx) {
  if (!aiDiagnosticRescueEnabled()) return false;
  if (stmt.parseQuality === 'OK' && stmt.checksumRecon?.ok) return true;

  const { identitySources = {}, effectiveRtn = null, correlationId = null } = ctx;
  const recon = stmt.checksumRecon || {};
  const breakdown = stmt.checksumDeltaProbe?.reconciliationBreakdown || null;
  const pageTelemetry = stmt.parseResult?.metadata?.pageTelemetry ?? [];

  if (correlationId) {
    setBatchProgress(correlationId, {
      phase: 'ai_diagnostic',
      fileName: stmt.fileName,
      rtn: effectiveRtn || null,
      message: `Diagnosing checksum mismatch for ${stmt.fileName}…`
    });
  }

  // Programmatic pre-check: bypass AI entirely when mathematical anomaly or pageTelemetry proves COLUMN_FLIP
  const programmaticDiag = detectProgrammaticAnomalies(stmt);
  if (programmaticDiag) {
    logger.info('[BATCH_ORCHESTRATOR] programmatic anomaly detected', {
      fileName: stmt.fileName,
      diagnosis: programmaticDiag.diagnosis,
      confidenceScore: programmaticDiag.confidenceScore,
      explanation: programmaticDiag.explanation
    });
    stmt.aiDiagnostic = { ...programmaticDiag, autoCorrected: false };
    const correction = await applyDiagnosticCorrection(stmt, programmaticDiag, identitySources);
    if (correction.corrected) {
      stmt.templateCoordinateStatus = 'DIAGNOSTIC_RESCUED';
      logger.info('[BATCH_ORCHESTRATOR] diagnostic rescue auto-corrected (programmatic)', {
        fileName: stmt.fileName,
        diagnosis: programmaticDiag.diagnosis
      });
      return true;
    }
    logger.warn('[BATCH_ORCHESTRATOR] programmatic correction failed — routing to HITL', {
      fileName: stmt.fileName,
      diagnosis: programmaticDiag.diagnosis
    });
    return false;
  }

  let layoutTextSample = null;
  if (stmt.fileBuffer) {
    try {
      layoutTextSample = (await extractTypeBTextFromBuffer(stmt.fileBuffer)).slice(0, 4000);
    } catch {
      layoutTextSample = null;
    }
  }

  const diagnostic = await analyzeMismatch({
    transactions: stmt.transactions || [],
    expectedOpeningBalance: recon.opening,
    expectedClosingBalance: recon.closing,
    calculatedClosingBalance: recon.computedClosing,
    reconciliationBreakdown: breakdown,
    pageTelemetry,
    layoutTextSample,
    fileName: stmt.fileName,
    bankName: stmt.bankName
  });

  stmt.aiDiagnostic = { ...diagnostic, autoCorrected: false };
  const correction = await applyDiagnosticCorrection(stmt, diagnostic, identitySources);
  if (correction.corrected) {
    stmt.templateCoordinateStatus = 'DIAGNOSTIC_RESCUED';
    logger.info('[BATCH_ORCHESTRATOR] diagnostic rescue auto-corrected', {
      fileName: stmt.fileName,
      diagnosis: diagnostic.diagnosis
    });
    return true;
  }

  logger.warn('[BATCH_ORCHESTRATOR] diagnostic rescue could not auto-correct — routing to HITL', {
    fileName: stmt.fileName,
    diagnosis: diagnostic.diagnosis,
    confidenceScore: diagnostic.confidenceScore
  });
  return false;
}

function getRtnFromParsed(stmt) {
  const pr = stmt.parseResult;
  const raw = pr?.rtn ?? pr?.metadata?.rtn ?? null;
  const cleaned = String(raw || '').replace(/\D/g, '');
  return cleaned.length === 9 ? cleaned : null;
}

function normalizeBankKey(bankName) {
  return String(bankName || 'unknown')
    .replace(/\s+/g, '_')
    .slice(0, 40)
    .toLowerCase();
}

export function layoutGroupKey(stmt) {
  const rtn = getRtnFromParsed(stmt);
  if (rtn) return `rtn:${rtn}`;
  const bank = normalizeBankKey(stmt.bankName);
  if (bank !== 'unknown') return `bank:${bank}`;
  const hash = String(stmt.fileHash || '').slice(0, 12);
  return hash ? `file:${hash}` : 'unknown';
}

function rtnMatchesBankName(rtn, bankName) {
  const mapped = RTN_BANK_MAP[rtn];
  if (!mapped || !bankName) return true;
  const a = String(mapped).toLowerCase().replace(/\s+/g, '');
  const b = String(bankName).toLowerCase().replace(/\s+/g, '');
  return a === b || a.includes(b) || b.includes(a);
}

async function scanRtnFromPdfBuffer(fileBuffer, bankName = '') {
  if (!fileBuffer) return null;
  try {
    const data = await pdfParse(fileBuffer);
    const text = data?.text || '';
    const rtnContextPattern = /(?:routing|aba|transit|rtn)[^\d]{0,30}(\d{9})/gi;
    let m;
    while ((m = rtnContextPattern.exec(text)) !== null) {
      if (RTN_BANK_MAP[m[1]] && rtnMatchesBankName(m[1], bankName)) return m[1];
    }
    const bare = text.match(/\b(\d{9})\b/g) || [];
    for (const digits of bare) {
      if (RTN_BANK_MAP[digits] && rtnMatchesBankName(digits, bankName)) return digits;
    }
  } catch (e) {
    logger.debug(`[BATCH_ORCHESTRATOR] RTN scan failed: ${e.message}`);
  }
  return null;
}

function regionsRtnFallback(stmt, identitySources = {}) {
  const bank = String(stmt.bankName || '').toLowerCase();
  if (!bank.includes('regions')) return null;
  return REGIONS_MS_RTN;
}

export async function resolveEffectiveRtn(firstStmt, identitySources) {
  let rtn = getRtnFromParsed(firstStmt);
  if (rtn) return rtn;
  rtn = await scanRtnFromPdfBuffer(firstStmt.fileBuffer, firstStmt.bankName);
  if (rtn) {
    if (firstStmt.parseResult) {
      firstStmt.parseResult.rtn = rtn;
      if (firstStmt.parseResult.metadata) firstStmt.parseResult.metadata.rtn = rtn;
    }
    return rtn;
  }
  rtn = regionsRtnFallback(firstStmt, identitySources);
  if (rtn) {
    logger.info(`[BATCH_ORCHESTRATOR] Regions RTN fallback ${rtn} for ${firstStmt.fileName}`);
    if (firstStmt.parseResult) {
      firstStmt.parseResult.rtn = rtn;
      if (firstStmt.parseResult.metadata) firstStmt.parseResult.metadata.rtn = rtn;
    }
  }
  return rtn;
}

function stmtSortKey(stmt) {
  const pr = stmt.parseResult;
  const periodStart = pr?.statementPeriod?.start;
  if (periodStart) return new Date(periodStart).getTime() || 0;
  if (stmt.statementDate) return new Date(stmt.statementDate).getTime() || 0;
  return 0;
}

function pickExemplarStatement(stmts) {
  const failing = stmts.filter((s) => s.parseQuality !== 'OK');
  if (failing.length === 0) return stmts[0];
  return [...failing].sort((a, b) => stmtSortKey(a) - stmtSortKey(b))[0];
}

function effectiveTxnCount(stmt) {
  return (stmt.transactions || []).filter((t) => t && !t.parseExcluded).length;
}

function effectiveDeposits(stmt) {
  const fromRecon = stmt.checksumRecon?.deposits;
  if (fromRecon != null && Number.isFinite(Number(fromRecon))) return Number(fromRecon);
  let sum = 0;
  for (const tx of stmt.transactions || []) {
    if (tx?.parseExcluded) continue;
    const n = Number(tx.amount);
    if (Number.isFinite(n) && isLedgerInflow({ amount: n, type: tx.type })) sum += Math.abs(n);
  }
  return sum;
}

function parseQualityScore(stmt) {
  const txnCount = effectiveTxnCount(stmt);
  const checksumOk = stmt.checksumRecon?.ok ? 1_000_000 : 0;
  return checksumOk + txnCount;
}

function snapshotStatementParse(stmt) {
  return {
    transactions: [...(stmt.transactions || [])],
    openingBalance: stmt.openingBalance,
    closingBalance: stmt.closingBalance,
    parseResult: stmt.parseResult ? { ...stmt.parseResult, transactions: [...(stmt.transactions || [])] } : null,
    stitcher: stmt.stitcher,
    parseQuality: stmt.parseQuality,
    checksumRecon: stmt.checksumRecon ? { ...stmt.checksumRecon } : null,
    validationReport: stmt.validationReport,
    checksumDeltaProbe: stmt.checksumDeltaProbe
  };
}

function restoreStatementParse(stmt, snap) {
  stmt.transactions = snap.transactions;
  stmt.openingBalance = snap.openingBalance;
  stmt.closingBalance = snap.closingBalance;
  stmt.parseResult = snap.parseResult;
  stmt.stitcher = snap.stitcher;
  stmt.parseQuality = snap.parseQuality;
  stmt.checksumRecon = snap.checksumRecon;
  stmt.validationReport = snap.validationReport;
  stmt.checksumDeltaProbe = snap.checksumDeltaProbe;
}

function isLayoutMisaligned(stmt) {
  const txnCount = effectiveTxnCount(stmt);
  const deposits = effectiveDeposits(stmt);
  if (txnCount === 0) return true;
  if (deposits === 0) {
    const opening = Number(stmt.openingBalance);
    const closing = Number(stmt.closingBalance);
    if (Number.isFinite(opening) && Number.isFinite(closing) && Math.abs(closing - opening) > 0.01) {
      return true;
    }
  }
  return false;
}

function parseMoneyFromProbeContext(context, key) {
  const text = String(context || '');
  if (key === 'depositsCredits' || key === 'totalDeposits') {
    const m = text.match(/deposits?\s*(?:\/|and)\s*credits?\s*[-]?\s*\$?\s*([\d,]+\.\d{2})/i);
    if (m) {
      const n = Number(m[1].replace(/,/g, ''));
      if (Number.isFinite(n) && n > 0) return n;
    }
  }
  const m = text.match(/([\d,]+\.\d{2})/);
  if (!m) return null;
  const n = Number(m[1].replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
}

function printedDepositsFromChecksumProbe(stmt) {
  const hits = stmt.checksumDeltaProbe?.printedTotals;
  if (!Array.isArray(hits)) return null;
  const depHit = hits.find((h) => h.key === 'depositsCredits' || h.key === 'totalDeposits');
  return depHit ? parseMoneyFromProbeContext(depHit.context, depHit.key) : null;
}

function printedTotalDeposits(stmt) {
  const raw =
    stmt.stitcher?.typeA?.printed?.totalDeposits ??
    stmt.parseResult?.metadata?.stitcher?.printedSummary?.totalDeposits;
  const n = Number(raw);
  if (Number.isFinite(n) && n > 0) return n;
  return printedDepositsFromChecksumProbe(stmt);
}

function mergePrintedSummary(prior = {}, next = {}) {
  return {
    opening: next.opening ?? prior.opening ?? null,
    closing: next.closing ?? prior.closing ?? null,
    totalDeposits: next.totalDeposits ?? prior.totalDeposits ?? null,
    totalWithdrawals: next.totalWithdrawals ?? prior.totalWithdrawals ?? null
  };
}

/** Checksum bleed: many txns but aggregate deposits drift vs printed summary. */
export function hasChecksumBleed(stmt) {
  if (stmt.checksumDeltaProbe?.probeHint !== 'AGGREGATE_MISMATCH') return false;
  const printed = printedTotalDeposits(stmt);
  const sumDep = effectiveDeposits(stmt);
  if (printed != null && printed > 0) {
    return sumDep / printed > 1.05;
  }
  return effectiveTxnCount(stmt) > 0 && stmt.checksumRecon?.ok === false;
}

function profileTier1Reconciled(stmt) {
  const meta = stmt.parseResult?.metadata;
  return (
    meta?.extractionTier === 1 &&
    meta?.profileReconciliation?.checksumOk === true
  );
}

function needsTemplateRescue(stmt) {
  if (profileTier1Reconciled(stmt)) return false;
  return isLayoutMisaligned(stmt) || hasChecksumBleed(stmt);
}

async function mergeParserResultIntoStatement(stmt, parseResult, identitySources, options = {}) {
  const priorSnap = options.monotonic ? snapshotStatementParse(stmt) : null;
  const priorScore = priorSnap ? parseQualityScore({ ...stmt, ...priorSnap }) : 0;

  const metaStitcher = parseResult.metadata?.stitcher;
  stmt.transactions = parseResult.transactions || [];
  stmt.openingBalance =
    parseResult.openingBalance ?? parseResult.balances?.opening ?? stmt.openingBalance;
  stmt.closingBalance =
    parseResult.closingBalance ?? parseResult.balances?.closing ?? stmt.closingBalance;
  stmt.bankName = parseResult.bankName || stmt.bankName;
  stmt.accountNumber = parseResult.accountNumber || parseResult.accountInfo?.accountNumber || stmt.accountNumber;
  stmt.parseResult = { ...stmt.parseResult, ...parseResult, transactions: stmt.transactions };
  if (metaStitcher?.printedSummary) {
    const mergedPrinted = mergePrintedSummary(
      stmt.stitcher?.typeA?.printed,
      metaStitcher.printedSummary
    );
    stmt.stitcher = {
      typeA: { printed: mergedPrinted },
      pages: metaStitcher.pageCount ?? stmt.stitcher?.pages,
      ...(metaStitcher.footer ? { typeC: { footer: metaStitcher.footer } } : stmt.stitcher?.typeC ? { typeC: stmt.stitcher.typeC } : {})
    };
  }
  if (parseResult.metadata?.pageCount != null) {
    stmt.pdfPageCount = parseResult.metadata.pageCount;
  }
  if (parseResult.metadata?.layoutPipelineShadow) {
    stmt.layoutPipelineShadow = parseResult.metadata.layoutPipelineShadow;
    logger.info('[BATCH_ORCHESTRATOR] layout pipeline shadow', {
      fileName: stmt.fileName,
      ...parseResult.metadata.layoutPipelineShadow
    });
  }
  applyParseQualityPipeline(stmt, identitySources);
  attachParseOutcomeFlags(stmt);
  await attachChecksumDeltaProbe(stmt);

  if (priorSnap && parseQualityScore(stmt) < priorScore) {
    restoreStatementParse(stmt, priorSnap);
    logger.warn('[BATCH_ORCHESTRATOR] layout re-parse rejected (worse than prior)', {
      fileName: stmt.fileName,
      priorTxns: effectiveTxnCount({ transactions: priorSnap.transactions }),
      newTxns: effectiveTxnCount(stmt)
    });
  }
}

/**
 * Spatial pdfplumber rescue before Gemini row extraction.
 * @returns {Promise<boolean>} true if parseQuality is OK after plumber
 */
async function tryPdfPlumberRescue(stmt, ctx) {
  if (!pdfPlumberEnabled() || !stmt.fileBuffer) return false;

  const dual = stmt.parseResult?.metadata?.dualEngine;
  if (
    dual?.ranPlumber &&
    dual?.chosenEngine === 'pdfplumber' &&
    stmt.parseQuality === 'OK' &&
    stmt.checksumRecon?.ok
  ) {
    logger.info('[BATCH_ORCHESTRATOR] pdfplumber rescue skipped — dual engine already passed', {
      fileName: stmt.fileName
    });
    return false;
  }

  if (dual?.ranPlumber && dual?.chosenEngine === 'pdf_parse' && dual?.plumberChecksumOk === false) {
    logger.info('[BATCH_ORCHESTRATOR] pdfplumber rescue proceeding — dual engine kept pdf-parse', {
      fileName: stmt.fileName,
      plumberError: dual.plumberError ?? null
    });
  }

  const { effectiveRtn, identitySources, correlationId } = ctx;
  const defaultYear =
    stmt.parseResult?.statementYear ??
    (stmt.statementDate ? new Date(stmt.statementDate).getFullYear() : new Date().getFullYear());

  if (correlationId) {
    setBatchProgress(correlationId, {
      phase: 'pdf_plumber_rescue',
      fileName: stmt.fileName,
      rtn: effectiveRtn || null,
      message: `Spatial table extraction for ${stmt.fileName}…`
    });
  }

  const plumberResult = await extractTransactionsFromPdfBuffer(stmt.fileBuffer, {
    bankName: stmt.bankName,
    fileName: stmt.fileName,
    defaultYear
  });

  if (!plumberResult.success || plumberResult.transactions.length === 0) {
    logger.info('[BATCH_ORCHESTRATOR] pdfplumber rescue skipped or empty', {
      fileName: stmt.fileName,
      error: plumberResult.error ?? null
    });
    return false;
  }

  await mergeParserResultIntoStatement(
    stmt,
    {
      success: true,
      transactions: plumberResult.transactions,
      openingBalance: plumberResult.openingBalance ?? stmt.openingBalance,
      closingBalance: plumberResult.closingBalance ?? stmt.closingBalance,
      balances: {
        opening: plumberResult.openingBalance ?? stmt.openingBalance,
        closing: plumberResult.closingBalance ?? stmt.closingBalance
      },
      metadata: {
        ...(stmt.parseResult?.metadata || {}),
        ...plumberResult.metadata,
        usedPdfPlumber: true,
        extractionEngine: 'pdfplumber',
        templateCoordinateStatus: 'PLUMBER_RESCUED'
      }
    },
    identitySources,
    { monotonic: false }
  );

  const ok = stmt.parseQuality === 'OK' && stmt.checksumRecon?.ok;
  logger.info('[BATCH_ORCHESTRATOR] pdfplumber rescue result', {
    fileName: stmt.fileName,
    parseQuality: stmt.parseQuality,
    checksumOk: stmt.checksumRecon?.ok,
    txnCount: effectiveTxnCount(stmt)
  });
  return ok;
}

/**
 * Per-file rescue: pdfplumber spatial tables first, then Gemini row extraction.
 */
async function escalateMisalignedFile(stmt, ctx) {
  if (!stmt.fileBuffer) {
    logger.warn('[BATCH_ORCHESTRATOR] template rescue skipped — no file buffer', {
      fileName: stmt.fileName
    });
    return false;
  }

  const { effectiveRtn, identitySources, correlationId } = ctx;
  const bleed = hasChecksumBleed(stmt);

  stmt.templateCoordinateStatus = 'PLUMBER_RESCUE';
  const plumberOk = await tryPdfPlumberRescue(stmt, ctx);
  if (plumberOk) {
    stmt.templateCoordinateStatus = 'PLUMBER_RESCUED';
    return true;
  }

  // Diagnostic AI Rescue (default): diagnose + programmatic auto-correct instead
  // of brute-force vision row extraction. Falls back to legacy extraction only
  // when explicitly disabled via AI_DIAGNOSTIC_RESCUE_ENABLED=false.
  if (aiDiagnosticRescueEnabled()) {
    stmt.templateCoordinateStatus = bleed ? 'BLEED_DIAGNOSTIC' : 'MISALIGNED_DIAGNOSTIC';
    return runDiagnosticRescue(stmt, { identitySources, effectiveRtn, correlationId });
  }

  if (!resolveLlmApiKey()) {
    logger.warn('[BATCH_ORCHESTRATOR] Gemini rescue skipped — no LLM API key', {
      fileName: stmt.fileName
    });
    return false;
  }

  stmt.templateCoordinateStatus = bleed ? 'BLEED_RESCUE' : 'MISALIGNED';

  if (correlationId) {
    setBatchProgress(correlationId, {
      phase: 'vision_row_rescue',
      fileName: stmt.fileName,
      rtn: effectiveRtn || null,
      message: bleed
        ? `Checksum bleed — rescuing ${stmt.fileName} with Gemini row extraction…`
        : `Layout misaligned — rescuing ${stmt.fileName} with Gemini row extraction…`
    });
  }

  logger.warn('[BATCH_ORCHESTRATOR] escalating to extractTransactionRows (legacy)', {
    fileName: stmt.fileName,
    reason: bleed ? 'checksum_bleed' : 'layout_misaligned',
    probeHint: stmt.checksumDeltaProbe?.probeHint ?? null,
    txnCount: effectiveTxnCount(stmt),
    deposits: effectiveDeposits(stmt),
    printedDeposits: printedTotalDeposits(stmt)
  });

  try {
    const rowResult = await extractTransactionRows(stmt.fileBuffer, {
      rtn: effectiveRtn || undefined,
      bankName: stmt.bankName,
      printedOpeningBalance: stmt.openingBalance,
      printedClosingBalance: stmt.closingBalance,
      defaultYear: stmt.parseResult?.statementYear
    });
    await mergeParserResultIntoStatement(
      stmt,
      {
        success: true,
        transactions: rowResult.transactions,
        openingBalance: rowResult.openingBalance ?? stmt.openingBalance,
        closingBalance: rowResult.closingBalance ?? stmt.closingBalance,
        balances: {
          opening: rowResult.openingBalance ?? stmt.openingBalance,
          closing: rowResult.closingBalance ?? stmt.closingBalance
        },
        metadata: {
          ...(stmt.parseResult?.metadata || {}),
          ...rowResult.metadata,
          usedVisionRowFallback: true,
          templateCoordinateStatus: bleed ? 'BLEED_RESCUED' : 'MISALIGNED_RESCUED'
        }
      },
      identitySources,
      { monotonic: false }
    );
    return !needsTemplateRescue(stmt);
  } catch (e) {
    logger.warn(`[BATCH_ORCHESTRATOR] MISALIGNED escalation failed ${stmt.fileName}: ${e.message}`);
    return false;
  }
}

async function localReparseAllInGroup(stmts, layoutTemplate, ctx) {
  const { parserService, identitySources = {}, finalAnchorData = {}, correlationId } = ctx;
  if (!parserService || !layoutTemplate) return;

  for (const stmt of stmts) {
    if (!stmt.fileBuffer) continue;
    try {
      // ── Step 1: Fast pre-parse Page 1 text for bank detection ──
      const page1Text = await fastPage1Text(stmt.fileBuffer);
      const detectedBank = detectBankName(page1Text);
      const effectiveBankName = detectedBank.bankName || stmt.bankName || 'generic';

      if (detectedBank.confidence === 'HIGH' || detectedBank.bankName !== 'generic') {
        stmt.bankName = effectiveBankName;
      }

      const parseResult = await parserService.parseStatement(stmt.fileBuffer, {
        ...finalAnchorData,
        layoutTemplate,
        correlationId,
        fileName: stmt.fileName,
        bankName: effectiveBankName,
        suppressWaterfallDetailLogs: true
      });
      if (!parseResult?.success) continue;
      await mergeParserResultIntoStatement(stmt, parseResult, identitySources, { monotonic: true });

      if (needsTemplateRescue(stmt)) {
        const { effectiveRtn } = ctx;
        await escalateMisalignedFile(stmt, { ...ctx, effectiveRtn: effectiveRtn ?? await resolveEffectiveRtn(stmt, identitySources) });
      }

      logger.info(
        `[BATCH_ORCHESTRATOR] Local re-parse ${stmt.fileName}: quality=${stmt.parseQuality} ` +
          `txns=${effectiveTxnCount(stmt)} checksumOk=${stmt.checksumRecon?.ok} ` +
          `templateStatus=${stmt.templateCoordinateStatus || 'ok'}`
      );
    } catch (e) {
      logger.warn(`[BATCH_ORCHESTRATOR] Local re-parse error ${stmt.fileName}: ${e.message}`);
    }
  }
}

async function teachLayoutOnce(groupKey, exemplar, effectiveRtn, ctx) {
  const {
    layoutByKey,
    institutionalProfileCache,
    correlationId,
    teachDoneByGroup,
    identitySources = {}
  } = ctx;

  let layout = layoutByKey.get(groupKey);
  if (layout) return layout;
  if (teachDoneByGroup.has(groupKey) && !ctx.allowSecondTeach) {
    return null;
  }

  let profile = null;
  if (effectiveRtn) {
    try {
      profile = await ensureInstitutionalProfileForRtn(effectiveRtn, {
        profileCache: institutionalProfileCache,
        correlationId,
        waterfallContext: {
          bankName: exemplar.bankName,
          identityMethod: exemplar.parseResult?.metadata?.identityMethod
        }
      });
    } catch (e) {
      logger.warn(`[BATCH_ORCHESTRATOR] profile lookup failed for ${effectiveRtn}: ${e.message}`);
    }
  }

  const learnable = profile ? getLatestLearnableTemplate(profile) : null;
  let triageResult = null;
  if (learnable?.mapping) {
    if (exemplar.fileBuffer) {
      try {
        const typeBText = await extractTypeBTextFromBuffer(exemplar.fileBuffer);
        const reuseCheck = shouldReuseLayoutWithoutGemini(learnable.mapping, typeBText);
        if (learnable.status === 'VERIFIED' && reuseCheck.reuse) {
          const { layout: prepared } = prepareLayoutForDigitalApply(learnable.mapping, typeBText);
          layoutByKey.set(groupKey, prepared);
          teachDoneByGroup.add(groupKey);
          logger.info('[BATCH_ORCHESTRATOR] Reusing VERIFIED layout fingerprint — skip Gemini', {
            groupKey,
            rtn: effectiveRtn,
            anchorStatus: reuseCheck.anchorStatus,
            fingerprint: reuseCheck.fingerprint?.slice(0, 80)
          });
          return prepared;
        }
        const { reject, reason, anchor, probe } = shouldRejectStoredMongoTemplate(
          learnable.mapping,
          typeBText
        );
        if (!reject) {
          const { layout: prepared } = prepareLayoutForDigitalApply(learnable.mapping, typeBText);
          layoutByKey.set(groupKey, prepared);
          logger.info('[BATCH_ORCHESTRATOR] Mongo LEARNING passed digital validation', {
            anchorStatus: anchor.status,
            mappedCount: probe.mappedCount,
            anchorsOnly: probe.anchorsOnly,
            fingerprint: reuseCheck.fingerprint?.slice(0, 80)
          });
          return prepared;
        }
        logger.warn('[BATCH_ORCHESTRATOR] Mongo LEARNING rejected — forcing fresh teach', {
          reason,
          anchorStatus: anchor.status,
          mappedCount: probe.mappedCount,
          anchorMisses: anchor.misses
        });
        // ── Template Evolution Detection ──
        try {
          const { buildLayoutFingerprint } = await import('./extraction/layoutFingerprintService.js');
          const incomingFp = buildLayoutFingerprint(learnable.mapping);
          const incomingSectionLabels = (learnable.mapping.transactionSections || [])
            .map(s => s?.label || '').filter(Boolean);
          triageResult = await triageLayoutMismatch({
            incomingFingerprint: incomingFp,
            expectedProfileId: profile._id,
            expectedProfileRtn: effectiveRtn,
            expectedProfileName: profile.legalName,
            parsedBankName: exemplar.bankName || exemplar.parseResult?.bankName || '',
            incomingSectionLabels,
            existingTemplateVersion: learnable.version,
            existingTemplateFingerprint: learnable.mapping?.layoutFingerprint || learnable.fingerprint || ''
          });

          if (triageResult.action === 'WRONG_INSTITUTION' && triageResult.targetProfileId) {
            logger.warn('[BATCH_ORCHESTRATOR] Triage: WRONG_INSTITUTION — re-routing', {
              from: profile.legalName,
              to: triageResult.targetProfileName,
              reason: triageResult.reason
            });
            await createRelationship(profile._id, {
              type: triageResult.relationshipType,
              targetProfileId: triageResult.targetProfileId,
              targetRtn: triageResult.targetProfileName,
              confidence: 0.9
            });
            // Re-lookup correct profile and its learnable template
            const correctProfile = await InstitutionalProfile.findById(triageResult.targetProfileId).lean();
            const correctLearnable = correctProfile ? getLatestLearnableTemplate(correctProfile) : null;
            if (correctLearnable?.mapping) {
              layoutByKey.set(groupKey, correctLearnable.mapping);
              return correctLearnable.mapping;
            }
            // If correct profile has no template either, fall through to teach
          }

          if (triageResult.action === 'FORMAT_CHANGE') {
            logger.warn('[BATCH_ORCHESTRATOR] Triage: FORMAT_CHANGE — learning variant', {
              profile: profile.legalName,
              parentVersion: triageResult.parentTemplateVersion,
              reason: triageResult.reason
            });
            // Continue to Gemini teach — the new template will have parentTemplateVersion set
            // when persisted via persistLearningTemplate
          }
        } catch (triageErr) {
          logger.warn('[BATCH_ORCHESTRATOR] Triage evaluation failed', {
            error: triageErr.message,
            rtn: effectiveRtn
          });
          triageResult = null;
        }
        if (effectiveRtn) {
          await clearVisionLayoutCacheForRtn(effectiveRtn);
        }
      } catch (e) {
        logger.warn(`[BATCH_ORCHESTRATOR] digital template validation failed: ${e.message}`);
      }
    } else {
      layoutByKey.set(groupKey, learnable.mapping);
      return learnable.mapping;
    }
  }

  if (!batchGeminiEnabled() || !exemplar.fileBuffer) {
    layoutByKey.set(groupKey, null);
    return null;
  }

  if (correlationId) {
    setBatchProgress(correlationId, {
      phase: 'template_learn',
      fileName: exemplar.fileName,
      rtn: effectiveRtn || null,
      message: `Learning statement layout from ${exemplar.fileName}…`
    });
  }

  try {
    if (effectiveRtn) {
      await clearVisionLayoutCacheForRtn(effectiveRtn);
    }
    logger.info(
      `[AI_LAYOUT] learnTemplateLayout key=${groupKey} rtn=${effectiveRtn || 'n/a'} exemplar=${exemplar.fileName}`
    );
    logger.info(`[BATCH_ORCHESTRATOR] ACTIVE_LLM=${resolveActiveLlm()} key=${groupKey}`);
    let digitalTextExcerpt = null;
    try {
      const typeB = await extractTypeBTextFromBuffer(exemplar.fileBuffer);
      digitalTextExcerpt = typeB.slice(0, 8000);
    } catch (e) {
      logger.warn(`[BATCH_ORCHESTRATOR] Type B excerpt for teach failed: ${e.message}`);
    }
    const raw = await learnTemplateLayout(exemplar.fileBuffer, {
      rtn: effectiveRtn || undefined,
      bankName: exemplar.bankName,
      printedOpeningBalance: exemplar.openingBalance,
      printedClosingBalance: exemplar.closingBalance,
      digitalTextExcerpt
    });
    const mapping = coerceLayoutMapping(raw);
    layoutByKey.set(groupKey, mapping);
    teachDoneByGroup.add(groupKey);

    if (profile?._id && mapping) {
      await persistLearningTemplate(profile._id, mapping, {
        parentTemplateVersion: triageResult?.parentTemplateVersion ?? undefined
      });
    }
    return mapping;
  } catch (e) {
    logger.warn(`[BATCH_ORCHESTRATOR] Gemini layout failed key=${groupKey}: ${e.message}`);
    layoutByKey.set(groupKey, null);
    return null;
  }
}

async function tryVisionRowFallback(stmt, ctx) {
  if (!batchUseVisionRowFallback() || !rowFallbackEnabled() || !stmt.fileBuffer) return false;

  const { effectiveRtn, identitySources } = ctx;
  try {
    logger.info(`[BATCH_ORCHESTRATOR] BATCH_USE_VISION_ROW_FALLBACK for ${stmt.fileName}`);
    const rowResult = await extractTransactionRows(stmt.fileBuffer, {
      rtn: effectiveRtn || undefined,
      bankName: stmt.bankName,
      printedOpeningBalance: stmt.openingBalance,
      printedClosingBalance: stmt.closingBalance,
      defaultYear: stmt.parseResult?.statementYear
    });
    await mergeParserResultIntoStatement(
      stmt,
      {
        success: true,
        transactions: rowResult.transactions,
        openingBalance: rowResult.openingBalance ?? stmt.openingBalance,
        closingBalance: rowResult.closingBalance ?? stmt.closingBalance,
        balances: {
          opening: rowResult.openingBalance ?? stmt.openingBalance,
          closing: rowResult.closingBalance ?? stmt.closingBalance
        },
        metadata: {
          ...(stmt.parseResult?.metadata || {}),
          ...rowResult.metadata,
          usedVisionRowFallback: true
        }
      },
      identitySources
    );
    return stmt.parseQuality === 'OK';
  } catch (e) {
    logger.warn(`[BATCH_ORCHESTRATOR] Vision row fallback failed ${stmt.fileName}: ${e.message}`);
    return false;
  }
}

/**
 * Per RTN/bank group: validate → one layout teach → re-parse all months locally.
 */
export async function processInstitutionalGroup(groupKey, stmts, ctx) {
  const {
    identitySources = {},
    institutionalProfileCache = new Map(),
    correlationId = null,
    layoutByKey,
    teachDoneByGroup,
    parserService,
    finalAnchorData = {},
    allowSecondTeach = false
  } = ctx;

  const digitalStmts = stmts.filter((s) => isDigitalPdfMode(s));
  if (digitalStmts.length === 0 || digitalStmts.every((s) => s.parseQuality === 'OK')) {
    return;
  }

  const effectiveRtn = await resolveEffectiveRtn(digitalStmts[0], identitySources);
  const exemplar = pickExemplarStatement(digitalStmts);

  let layout = layoutByKey.get(groupKey) || null;
  const alreadyTaught = teachDoneByGroup.has(groupKey);

  if (!layout && !alreadyTaught) {
    layout = await teachLayoutOnce(groupKey, exemplar, effectiveRtn, ctx);
  } else if (!layout && allowSecondTeach) {
    layout = await teachLayoutOnce(groupKey, exemplar, effectiveRtn, ctx);
  }

  if (layout && parserService) {
    if (exemplar?.fileBuffer) {
      try {
        const typeB = await extractTypeBTextFromBuffer(exemplar.fileBuffer);
        const { layout: prepared, probe } = prepareLayoutForDigitalApply(layout, typeB);
        layout = prepared;
        logger.info('[BATCH_ORCHESTRATOR] digital layout prepared for re-parse', {
          anchorsOnly: probe.anchorsOnly,
          mappedCount: probe.mappedCount,
          anchorStatus: probe.anchorStatus
        });
      } catch (e) {
        logger.warn(`[BATCH_ORCHESTRATOR] prepareLayoutForDigitalApply failed: ${e.message}`);
      }
    }
    if (correlationId) {
      setBatchProgress(correlationId, {
        phase: 'local_reparse',
        rtn: effectiveRtn || null,
        message: `Re-parsing ${stmts.length} statement(s) with learned layout…`
      });
    }
    await localReparseAllInGroup(digitalStmts, layout, { ...ctx, effectiveRtn });
  }

  const stillFailing = digitalStmts.filter((s) => s.parseQuality !== 'OK');
  if (stillFailing.length > 0) {
    if (aiDiagnosticRescueEnabled()) {
      for (const stmt of stillFailing) {
        await runDiagnosticRescue(stmt, { effectiveRtn, identitySources, correlationId });
      }
    } else if (batchUseVisionRowFallback()) {
      const fallbackCtx = { effectiveRtn, identitySources };
      for (const stmt of stillFailing) {
        await tryVisionRowFallback(stmt, fallbackCtx);
      }
    }
  }
}

export async function enhanceBatchParsesWithTeacher(parsedStatements, ctx = {}) {
  const {
    identitySources = {},
    institutionalProfileCache = new Map(),
    correlationId = null,
    parserService = null,
    finalAnchorData = {}
  } = ctx;

  const visionKeyPresent = Boolean(resolveLlmApiKey());
  logger.info('[BATCH_ORCHESTRATOR] Vision config', {
    activeLlm: resolveActiveLlm(),
    geminiApiKeyPresent: visionKeyPresent,
    batchUseVisionRowFallback: batchUseVisionRowFallback(),
    correlationId: correlationId || undefined
  });
  if (!visionKeyPresent) {
    logger.warn(
      '[BATCH_ORCHESTRATOR] GEMINI_API_KEY / GOOGLE_API_KEY missing — layout teach disabled'
    );
  }

  const layoutByKey = new Map();
  const teachDoneByGroup = new Set();
  const batchAlerts = [];
  const aggregateSanity = {
    inputCount: 0,
    acceptedCount: 0,
    rejectedIdentity: 0,
    rejectedNoDecimal: 0,
    rejectedAbsurdity: 0,
    rejectedInvalid: 0
  };

  const byGroup = new Map();
  for (const stmt of parsedStatements) {
    const key = layoutGroupKey(stmt);
    if (!byGroup.has(key)) byGroup.set(key, []);
    byGroup.get(key).push(stmt);
  }

  const groupCtx = {
    identitySources,
    institutionalProfileCache,
    correlationId,
    layoutByKey,
    teachDoneByGroup,
    parserService,
    finalAnchorData,
    allowSecondTeach: false
  };

  await Promise.all(
    [...byGroup.entries()].map(([groupKey, stmts]) =>
      processInstitutionalGroup(groupKey, stmts, groupCtx)
    )
  );

  for (const stmt of parsedStatements) {
    const stats = stmt.parseSanityStats || {};
    for (const k of Object.keys(aggregateSanity)) {
      if (k in stats) aggregateSanity[k] += stats[k] || 0;
    }
    if (stmt.parseQuality !== 'OK' && stmt.checksumRecon && !stmt.checksumRecon.ok) {
      batchAlerts.push({
        ...buildReconciliationMismatchAlert(stmt.checksumRecon),
        data: {
          ...buildReconciliationMismatchAlert(stmt.checksumRecon).data,
          fileName: stmt.fileName,
          validationTiers: stmt.validationReport?.forensicMetadata?.validationTiers
        }
      });
    }
  }

  const bleedAlert = buildParsingBleedAlert(aggregateSanity);
  if (bleedAlert) batchAlerts.push(bleedAlert);

  return { parsedStatements, batchAlerts, aggregateSanity, teachDoneByGroup, layoutByKey };
}

export async function runChecksumGateRecovery(parsedStatements, ctx = {}) {
  const {
    identitySources = {},
    institutionalProfileCache = new Map(),
    correlationId = null,
    parserService = null,
    finalAnchorData = {},
    teachDoneByGroup: teachDoneFromEnhance = new Set(),
    layoutByKey: layoutByKeyFromEnhance = null
  } = ctx;

  const failing = parsedStatements.filter((s) => s.parseQuality !== 'OK');
  if (failing.length === 0) {
    return {
      attempted: false,
      succeeded: true,
      recoveredCount: 0,
      perFile: [],
      rtnsCleared: []
    };
  }

  if (correlationId) {
    setBatchProgress(correlationId, {
      phase: 'checksum_recovery',
      message: 'Integrity gate below 80% — layout teach + local re-parse rescue…'
    });
  }

  const layoutByKey = new Map();
  if (layoutByKeyFromEnhance instanceof Map) {
    for (const [k, v] of layoutByKeyFromEnhance.entries()) {
      if (v) layoutByKey.set(k, v);
    }
  }
  const teachDoneByGroup = new Set(teachDoneFromEnhance);
  const byGroup = new Map();
  for (const stmt of failing) {
    const key = layoutGroupKey(stmt);
    if (!byGroup.has(key)) byGroup.set(key, []);
    byGroup.get(key).push(stmt);
  }

  const allStmtsByGroup = new Map();
  for (const stmt of parsedStatements) {
    const key = layoutGroupKey(stmt);
    if (!allStmtsByGroup.has(key)) allStmtsByGroup.set(key, []);
    allStmtsByGroup.get(key).push(stmt);
  }

  const rtnsCleared = [];
  const perFile = [];
  let recoveredCount = 0;

  const groupCtx = {
    identitySources,
    institutionalProfileCache,
    correlationId,
    layoutByKey,
    teachDoneByGroup,
    parserService,
    finalAnchorData,
    allowSecondTeach: false
  };

  await Promise.all(
    [...byGroup.entries()].map(async ([groupKey]) => {
      const effectiveRtn = await resolveEffectiveRtn(byGroup.get(groupKey)[0], identitySources);
      const hasLayout = Boolean(layoutByKey.get(groupKey));
      if (effectiveRtn && !hasLayout) {
        if (correlationId) {
          setBatchProgress(correlationId, {
            phase: 'cache_eviction',
            rtn: effectiveRtn,
            message: `Clearing cached layout for routing ${effectiveRtn}…`
          });
        }
        const evict = await clearVisionLayoutCacheForRtn(effectiveRtn);
        rtnsCleared.push({ rtn: effectiveRtn, deleted: evict.deleted, keys: evict.keys });
      }
      const fullGroup = allStmtsByGroup.get(groupKey) || byGroup.get(groupKey);
      await processInstitutionalGroup(groupKey, fullGroup, groupCtx);
    })
  );

  for (const stmt of failing) {
    const nowOk = stmt.parseQuality === 'OK';
    if (nowOk) recoveredCount += 1;
    perFile.push({
      fileName: stmt.fileName,
      parseQuality: stmt.parseQuality || 'UNKNOWN',
      checksumOk: Boolean(stmt.checksumRecon?.ok),
      deltaProbeHint: stmt.checksumDeltaProbe?.probeHint ?? null,
      validatorOk: Boolean(stmt.validationReport?.overallOk),
      localReparseOk: nowOk
    });
  }

  const stats = computeBatchChecksumStats(parsedStatements);
  const succeeded = stats.ratio >= MACRO_CHECKSUM_MIN_OK_RATIO;

  if (correlationId) {
    setBatchProgress(correlationId, {
      phase: succeeded ? 'checksum_recovery_complete' : 'checksum_recovery_failed',
      message: succeeded
        ? 'Alignment rescue succeeded — continuing macro analysis…'
        : 'Alignment rescue finished — integrity gate still below 80%.'
    });
  }

  logger.info('[BATCH_ORCHESTRATOR] CHECKSUM_GATE recovery complete', {
    recoveredCount,
    ratio: stats.ratio,
    succeeded
  });

  return {
    attempted: true,
    succeeded,
    recoveredCount,
    perFile,
    rtnsCleared,
    checksumPassRatio: stats.ratio,
    checksumMinRatio: MACRO_CHECKSUM_MIN_OK_RATIO
  };
}

export default {
  enhanceBatchParsesWithTeacher,
  runChecksumGateRecovery,
  computeBatchChecksumStats,
  processInstitutionalGroup,
  MACRO_CHECKSUM_MIN_OK_RATIO,
  batchUseVisionRowFallback,
  layoutGroupKey,
  hasChecksumBleed
};
