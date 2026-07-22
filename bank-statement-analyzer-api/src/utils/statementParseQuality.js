import { validateReconciliation } from '../services/templateGraduationService.js';
import { reconcileStatement } from '../services/extraction/statementReconciliation.js';
import { isTier1CodeProfile } from '../services/extraction/bankProfileRegistry.js';
import {
  buildDealIdentity,
  sanitizeTransactionsForMacro
} from './amountSanityGuardrails.js';
import {
  lineHintsCreditForMergedPdf,
  lineHintsDebitForMergedPdf,
  inferTransactionTypeFromLine
} from '../services/pdfParserService.js';
import {
  normalizeTransactionForLedger,
  normalizeTransactionsWithBalanceInference,
  isLedgerInflow,
  isLedgerOutflow
} from './transactionNormalization.js';
import { runChecksumDeltaProbe } from './checksumDeltaProbe.js';
import { validateStatement } from './statementValidator.js';
import logger from './logger.js';
import pdfParse from 'pdf-parse';
import {
  buildParseDiagnosticReport,
  dedupeExactFingerprints,
  parseDebugEnabled
} from './parseDiagnosticReport.js';
import { verifyParseCandidate } from '../services/extraction/isVerifiedCandidate.js';
import { createParseCandidate } from '../services/extraction/parseCandidateContract.js';
import {
  buildParseManifest,
  buildReviewPacket,
  documentHash,
  PARSER_VERSION
} from '../services/extraction/parseManifest.js';
import { classifyChecksumFailure } from './checksumFailureMatrix.js';
import { normalizeFailureClass } from '../services/extraction/repairMatrix.js';

/**
 * Flip positive amounts on debit-hint lines when balance inference did not sign them.
 * @param {Array<object>} transactions
 * @returns {Array<object>}
 */
export function applyLineHintSigns(transactions) {
  if (!Array.isArray(transactions)) return [];
  return transactions.map((tx) => {
    if (!tx || typeof tx !== 'object') return tx;

    // Profile-signed rows (section-tagged or Tier-1 extraction) keep their signs.
    const sectionTagged = Boolean(tx.section || tx.sectionLabel);
    const profileSigned =
      sectionTagged ||
      (tx.extractionSource && isTier1CodeProfile(String(tx.extractionSource)));
    if (profileSigned) return normalizeTransactionForLedger({ ...tx });

    const line = String(tx.rawLine || tx.description || '');
    const amt = Number(tx.amount);
    if (!Number.isFinite(amt) || amt === 0) return tx;

    // Explicit minus in the extracted amount is authoritative over text hints.
    const explicitNegative = /^\s*\(?-/.test(String(tx.rawAmount ?? ''));

    let next = { ...tx };
    if (amt > 0 && !explicitNegative && lineHintsDebitForMergedPdf(line)) {
      next = { ...next, amount: -Math.abs(amt), type: 'debit' };
    } else if (amt < 0 && explicitNegative) {
      next = { ...next, type: 'debit' };
    } else if (amt < 0 && lineHintsCreditForMergedPdf(line) && !lineHintsDebitForMergedPdf(line)) {
      next = { ...next, amount: Math.abs(amt), type: 'credit' };
    } else if (amt > 0 && lineHintsCreditForMergedPdf(line) && !lineHintsDebitForMergedPdf(line)) {
      next = { ...next, type: 'credit' };
    } else {
      const inferred = inferTransactionTypeFromLine(line, amt);
      if (inferred === 'debit') {
        next = { ...next, amount: -Math.abs(amt), type: 'debit' };
      } else if (inferred === 'credit') {
        next = { ...next, type: 'credit' };
      }
    }
    return normalizeTransactionForLedger(next);
  });
}

/**
 * Extract profile reconciliation meta when present on parse result metadata.
 * @param {object} parsedStatement
 */
function extractProfileReconciliationMeta(parsedStatement) {
  const profileRecon =
    parsedStatement.parseResult?.metadata?.profileReconciliation ??
    parsedStatement.parseResult?.metadata?.profileReconciliationMeta ??
    null;
  if (!profileRecon || typeof profileRecon !== 'object') return null;
  return profileRecon;
}

/**
 * Build parseResult shape for validateReconciliation from a staged statement row.
 */
export function buildParseResultForRecon(parsedStatement) {
  let stitcher = parsedStatement.stitcher ?? null;
  const metaStitcher = parsedStatement.parseResult?.metadata?.stitcher;
  if (!stitcher && metaStitcher?.printedSummary) {
    stitcher = {
      typeA: { printed: metaStitcher.printedSummary },
      typeC: metaStitcher.footer ? { footer: metaStitcher.footer } : undefined
    };
  }
  const printed = stitcher?.typeA?.printed;
  const profileRecon = extractProfileReconciliationMeta(parsedStatement);

  const opening =
    profileRecon?.openingBalance ??
    (printed?.opening != null ? printed.opening : parsedStatement.openingBalance);
  const closing =
    profileRecon?.closingBalance ??
    (printed?.closing != null ? printed.closing : parsedStatement.closingBalance);

  const printedDeposits =
    profileRecon?.printedDeposits ??
    (printed?.totalDeposits != null ? printed.totalDeposits : null);
  const printedWithdrawals =
    profileRecon?.printedWithdrawals ??
    (printed?.totalWithdrawals != null ? printed.totalWithdrawals : null);

  const stitcherVitamins =
    printedDeposits != null || printedWithdrawals != null
      ? {
          printedDeposits,
          printedWithdrawals,
          footer: parsedStatement.parseResult?.metadata?.stitcher?.footer
        }
      : undefined;

  return {
    transactions: parsedStatement.transactions || [],
    openingBalance: opening,
    closingBalance: closing,
    balances: { opening, closing },
    stitcherVitamins,
    profileReconciliation: profileRecon,
    reconciliationSpec: profileRecon?.reconciliationSpec ?? null,
    printedLines: profileRecon?.printedLines ?? null
  };
}

// Printed-activity tolerance: max($1.00 absolute, 1% relative). The absolute floor
// keeps sub-dollar rounding and unmapped minor fee lines on small-activity statements
// from failing the whole checksum (1% of $50 is $0.50 — tighter than the printed
// totals themselves are reliable). NOTE: statementReconciliation.js keeps its own
// $0.01 absolute tolerance on purpose — that check is the closing-balance arithmetic
// identity (opening + flows = closing), which must stay exact; this one compares
// parsed flows against PRINTED summary totals, which legitimately drift on unmapped
// minor lines.
const PRINTED_ACTIVITY_DRIFT = 0.01;
const PRINTED_ACTIVITY_ABS_FLOOR = 1.0;

/**
 * True when parsed activity is within max($1, 1%) of the printed total.
 * @param {number} parsedSum
 * @param {number} printedTotal
 */
function printedActivityWithinTolerance(parsedSum, printedTotal) {
  const tolerance = Math.max(PRINTED_ACTIVITY_ABS_FLOOR, printedTotal * PRINTED_ACTIVITY_DRIFT);
  return Math.abs(parsedSum - printedTotal) <= tolerance;
}

/**
 * Sum parsed ledger flows excluding macro-excluded rows.
 * @param {Array<object>} transactions
 */
function sumParsedActivity(transactions) {
  let sumDep = 0;
  let sumWith = 0;
  for (const tx of transactions || []) {
    if (tx?.excludeFromMacroTotals) continue;
    const n = Number(tx.amount);
    if (!Number.isFinite(n)) continue;
    if (isLedgerInflow(tx)) sumDep += Math.abs(n);
    else if (isLedgerOutflow(tx)) sumWith += Math.abs(n);
  }
  return { sumDep, sumWith };
}

/**
 * Merge closing-balance checksum with printed activity totals when stitcher vitamins exist.
 * @param {object} checksumRecon - from validateReconciliation
 * @param {object|undefined} stitcherVitamins
 * @param {Array<object>} transactions
 */
export function enrichChecksumWithPrintedActivity(checksumRecon, stitcherVitamins, transactions) {
  const printedDep = stitcherVitamins?.printedDeposits;
  const printedWith = stitcherVitamins?.printedWithdrawals;
  const { sumDep, sumWith } = sumParsedActivity(transactions);

  let depositsMatch = true;
  let withdrawalsMatch = true;

  if (printedDep != null && Number.isFinite(Number(printedDep)) && Number(printedDep) > 0) {
    depositsMatch = printedActivityWithinTolerance(sumDep, Number(printedDep));
  }
  if (printedWith != null && Number.isFinite(Number(printedWith)) && Number(printedWith) > 0) {
    withdrawalsMatch = printedActivityWithinTolerance(sumWith, Number(printedWith));
  }

  const closingMatch = Boolean(checksumRecon?.ok);
  const hasPrintedActivity =
    (printedDep != null && Number(printedDep) > 0) ||
    (printedWith != null && Number(printedWith) > 0);
  const activityMatch = !hasPrintedActivity || (depositsMatch && withdrawalsMatch);
  const ok = closingMatch && activityMatch;

  const reasons = [];
  if (!closingMatch && checksumRecon?.reason) reasons.push(checksumRecon.reason);
  if (hasPrintedActivity && !depositsMatch) {
    reasons.push(
      `printed deposits drift: parsed $${sumDep.toFixed(2)} vs printed $${Number(printedDep).toFixed(2)}`
    );
  }
  if (hasPrintedActivity && !withdrawalsMatch) {
    reasons.push(
      `printed withdrawals drift: parsed $${sumWith.toFixed(2)} vs printed $${Number(printedWith).toFixed(2)}`
    );
  }

  return {
    ...checksumRecon,
    ok,
    closingMatch,
    depositsMatch,
    withdrawalsMatch,
    parsedDeposits: sumDep,
    parsedWithdrawals: sumWith,
    printedDeposits: printedDep ?? null,
    printedWithdrawals: printedWith ?? null,
    reason: ok ? undefined : reasons.join('; ') || checksumRecon?.reason
  };
}

/**
 * Map reconcileStatement output to batch checksumRecon shape.
 * @param {object} specRecon — from reconcileStatement
 * @param {object} closingRecon — from validateReconciliation
 */
function mergeSpecProfileChecksum(specRecon, closingRecon) {
  const closingMatch = Boolean(closingRecon?.ok);
  const depositsMatch = Boolean(specRecon?.depositsMatch);
  const withdrawalsMatch = Boolean(specRecon?.withdrawalsMatch);
  // Align with universal ledger gate (Tier-A or activity). Printed SUMMARY
  // identity remains a soft signal, not a false-pass path.
  const ok = Boolean(specRecon?.checksumOk ?? specRecon?.ledgerOk);

  const reasons = [];
  if (!ok && !closingMatch && closingRecon?.reason) reasons.push(closingRecon.reason);
  if (!depositsMatch) {
    reasons.push(
      `printed deposits drift: parsed $${Number(specRecon.parsedDeposits).toFixed(2)} vs printed $${Number(specRecon.printedDeposits).toFixed(2)}`
    );
  }
  if (!withdrawalsMatch) {
    reasons.push(
      `printed withdrawals drift: parsed $${Number(specRecon.parsedWithdrawals).toFixed(2)} vs printed $${Number(specRecon.printedWithdrawals).toFixed(2)}`
    );
  }
  if (!specRecon?.printedClosingMatch && specRecon?.printedLines) {
    reasons.push('printed summary identity mismatch');
  }
  if (!ok && !reasons.length) {
    reasons.push('ledger gate failed (need Tier-A closing or printed activity match)');
  }

  return {
    ok,
    closingMatch,
    depositsMatch,
    withdrawalsMatch,
    opening: specRecon.opening,
    closing: specRecon.closing,
    deposits: specRecon.parsedDeposits,
    withdrawals: specRecon.parsedWithdrawals,
    parsedDeposits: specRecon.parsedDeposits,
    parsedWithdrawals: specRecon.parsedWithdrawals,
    printedDeposits: specRecon.printedDeposits,
    printedWithdrawals: specRecon.printedWithdrawals,
    computedClosing: specRecon.computedClosing,
    delta: closingRecon?.delta,
    sectionReconciled: specRecon.sectionReconciled,
    lineDeltas: specRecon.lineDeltas,
    printedClosingMatch: specRecon.printedClosingMatch,
    ledgerOk: Boolean(specRecon?.ledgerOk ?? specRecon?.checksumOk),
    reason: ok ? undefined : reasons.join('; ')
  };
}

/**
 * Sanitize → normalize → checksum; mutates parsedStatement in place.
 * @returns {{ checksumRecon: object, parseQuality: 'OK'|'FAILED_CHECKSUM', parseSanityStats: object }}
 */
export function applyParseQualityPipeline(parsedStatement, identitySources = {}) {
  const rawRows = (parsedStatement.transactions || []).map((t) => ({ ...t }));
  const dealIdentity = buildDealIdentity({
    ...identitySources,
    parseResult: parsedStatement.parseResult,
    accountNumber: parsedStatement.accountNumber
  });

  const { accepted, stats } = sanitizeTransactionsForMacro(
    parsedStatement.transactions || [],
    dealIdentity
  );
  const afterSanitize = dedupeExactFingerprints(accepted);
  const normalized = applyLineHintSigns(
    normalizeTransactionsWithBalanceInference(afterSanitize, {
      openingBalance: parsedStatement.openingBalance ?? parsedStatement.parseResult?.openingBalance
    })
  );
  parsedStatement.transactions = normalized;
  parsedStatement.parseSanityStats = stats;

  const reconInput = buildParseResultForRecon(parsedStatement);
  if (reconInput.openingBalance != null) parsedStatement.openingBalance = reconInput.openingBalance;
  if (reconInput.closingBalance != null) parsedStatement.closingBalance = reconInput.closingBalance;

  const closingRecon = validateReconciliation(reconInput);
  const hasSpecProfile =
    Boolean(reconInput.reconciliationSpec) ||
    (reconInput.printedLines != null && Object.keys(reconInput.printedLines).length > 0);

  let checksumRecon;
  if (hasSpecProfile) {
    const specMeta = {
      openingBalance: reconInput.openingBalance,
      closingBalance: reconInput.closingBalance,
      printedDeposits: reconInput.stitcherVitamins?.printedDeposits,
      printedWithdrawals: reconInput.stitcherVitamins?.printedWithdrawals,
      printedLines: reconInput.printedLines,
      reconciliationSpec: reconInput.reconciliationSpec
    };
    const specRecon = reconcileStatement(specMeta, normalized);
    checksumRecon = mergeSpecProfileChecksum(specRecon, closingRecon);
    // #region agent log
    fetch('http://127.0.0.1:7779/ingest/14ba3817-11f8-4e9c-85f8-0a9bab98d3ad', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '05b151' },
      body: JSON.stringify({
        sessionId: '05b151',
        runId: 'pre-fix',
        hypothesisId: 'B,D',
        location: 'statementParseQuality.js:mergeSpec',
        message: 'batch quality after normalize+merge',
        data: {
          fileName: parsedStatement.fileName || null,
          profileId: parsedStatement.parseResult?.metadata?.extractionProfile || null,
          txnCount: normalized.length,
          specChecksumOk: specRecon?.checksumOk ?? null,
          mergedOk: checksumRecon?.ok ?? null,
          depositsMatch: specRecon?.depositsMatch ?? null,
          withdrawalsMatch: specRecon?.withdrawalsMatch ?? null,
          printedClosingMatch: specRecon?.printedClosingMatch ?? null,
          parsedDeposits: specRecon?.parsedDeposits ?? null,
          printedDeposits: specRecon?.printedDeposits ?? null,
          parsedWithdrawals: specRecon?.parsedWithdrawals ?? null,
          printedWithdrawals: specRecon?.printedWithdrawals ?? null
        },
        timestamp: Date.now()
      })
    }).catch(() => {});
    // #endregion
  } else {
    checksumRecon = enrichChecksumWithPrintedActivity(
      closingRecon,
      reconInput.stitcherVitamins,
      normalized
    );
  }
  parsedStatement.checksumRecon = checksumRecon;

  const validationReport = validateStatement(parsedStatement, {
    pdfMeta: { numpages: parsedStatement.parseResult?.metadata?.pageCount }
  });
  parsedStatement.validationReport = validationReport;

  parsedStatement.validationOk = validationReport.overallOk;

  // Sole VERIFIED authority for parseFinalStatus (not confused with template graduation).
  const engine =
    parsedStatement.parseResult?.metadata?.dualEngine?.chosenEngine ||
    parsedStatement.parseResult?.metadata?.chosenEngine ||
    'text';
  const candidate = verifyParseCandidate(
    createParseCandidate({
      engine: engine === 'pdfplumber' ? 'plumber' : engine === 'pdf_parse' ? 'text' : engine,
      transactions: normalized,
      meta: {
        openingBalance: reconInput.openingBalance,
        closingBalance: reconInput.closingBalance,
        printedDeposits: reconInput.stitcherVitamins?.printedDeposits,
        printedWithdrawals: reconInput.stitcherVitamins?.printedWithdrawals,
        printedLines: reconInput.printedLines,
        reconciliationSpec: reconInput.reconciliationSpec,
        accountNumber: parsedStatement.accountNumber,
        periodStart: parsedStatement.periodStart || parsedStatement.statementPeriod?.start,
        periodEnd: parsedStatement.periodEnd || parsedStatement.statementPeriod?.end
      },
      documentClass: parsedStatement.parseResult?.metadata?.documentClass || null
    })
  );
  parsedStatement.parseCandidateVerification = candidate.verification;
  // Only isVerifiedCandidate may set VERIFIED — never engines/profiles alone.
  parsedStatement.parseFinalStatus = candidate.finalStatus;

  const classified = classifyChecksumFailure(
    candidate.verification?.recon || {
      checksumOk: checksumRecon.ok,
      checksumRecon,
      depositsMatch: checksumRecon.depositsMatch,
      withdrawalsMatch: checksumRecon.withdrawalsMatch,
      printedClosingMatch: true,
      printedDeposits: checksumRecon.printedDeposits,
      printedWithdrawals: checksumRecon.printedWithdrawals,
      parsedDeposits: checksumRecon.parsedDeposits ?? checksumRecon.deposits,
      parsedWithdrawals: checksumRecon.parsedWithdrawals ?? checksumRecon.withdrawals
    },
    normalized
  );
  const failureClass = candidate.verification?.isVerified
    ? 'OK'
    : normalizeFailureClass(classified, candidate.verification?.recon);

  const manifest = buildParseManifest({
    documentHash: parsedStatement.fileBuffer
      ? documentHash(parsedStatement.fileBuffer)
      : parsedStatement.documentHash || null,
    documentClass: parsedStatement.parseResult?.metadata?.documentClass || null,
    candidates: [candidate],
    selectedCandidate: candidate.verification?.isVerified ? candidate : null,
    finalStatus: candidate.finalStatus || failureClass,
    profileId: parsedStatement.parseResult?.metadata?.extractionProfile || null,
    profileVersion: parsedStatement.parseResult?.metadata?.profileVersion || null,
    parserVersion: PARSER_VERSION
  });
  parsedStatement.parseManifest = manifest;
  parsedStatement.reviewPacket = candidate.verification?.isVerified
    ? null
    : buildReviewPacket({
        finalStatus: failureClass,
        failureClass,
        candidates: [candidate],
        recon: candidate.verification?.recon,
        missingSections: []
      });

  // Macro batch ratio still uses arithmetic/spec checksum; VERIFIED is the stricter gate.
  const parseQualityOk = checksumRecon.ok;
  parsedStatement.parseQuality = parseQualityOk ? 'OK' : 'FAILED_CHECKSUM';

  if (parseDebugEnabled() || !checksumRecon.ok) {
    const printed = parsedStatement.stitcher?.typeA?.printed;
    parsedStatement.parseDiagnostic = buildParseDiagnosticReport({
      fileName: parsedStatement.fileName,
      rawRows,
      afterSanitize,
      afterHints: normalized,
      stitcherPrinted: printed || {
        totalDeposits: reconInput.stitcherVitamins?.printedDeposits,
        totalWithdrawals: reconInput.stitcherVitamins?.printedWithdrawals,
        opening: reconInput.openingBalance,
        closing: reconInput.closingBalance
      },
      checksumRecon,
      parseSanityStats: stats
    });
    if (!checksumRecon.ok) {
      logger.warn('[PARSE_DIAGNOSTIC] Checksum failed', {
        fileName: parsedStatement.fileName,
        delta: checksumRecon.delta,
        txnCount: normalized.length
      });
    }
  }

  attachParseOutcomeFlags(parsedStatement);

  if (!checksumRecon.ok && checksumRecon.depositsMatch === false) {
    logger.warn('[PARSE_QUALITY] Type B deposits drift from Type A printed total', {
      fileName: parsedStatement.fileName,
      sumDeposits: checksumRecon.parsedDeposits,
      printedDeposits: checksumRecon.printedDeposits,
      depositsMatch: checksumRecon.depositsMatch
    });
  }
  if (!checksumRecon.ok && checksumRecon.withdrawalsMatch === false) {
    logger.warn('[PARSE_QUALITY] Type B withdrawals drift from Type A printed total', {
      fileName: parsedStatement.fileName,
      sumWithdrawals: checksumRecon.parsedWithdrawals,
      printedWithdrawals: checksumRecon.printedWithdrawals,
      withdrawalsMatch: checksumRecon.withdrawalsMatch
    });
  }

  return { checksumRecon, parseQuality: parsedStatement.parseQuality, parseSanityStats: stats };
}

/**
 * Run delta probe when checksum fails (uses rawText or lazy pdf-parse on fileBuffer).
 * @returns {Promise<object|null>}
 */
export async function attachChecksumDeltaProbe(parsedStatement) {
  if (!parsedStatement?.checksumRecon || parsedStatement.checksumRecon.ok) {
    parsedStatement.checksumDeltaProbe = null;
    return null;
  }

  let rawText =
    parsedStatement.parseResult?.rawText ||
    parsedStatement.rawText ||
    null;

  if (!rawText && parsedStatement.fileBuffer) {
    try {
      const data = await pdfParse(parsedStatement.fileBuffer);
      rawText = data?.text || '';
    } catch {
      rawText = '';
    }
  }

  const txnCount = parsedStatement.parseResult?.transactions?.length ?? null;
  const probe = runChecksumDeltaProbe(
    parsedStatement.fileName,
    parsedStatement.checksumRecon,
    rawText,
    { txnCount }
  );
  parsedStatement.checksumDeltaProbe = probe;
  return probe;
}

/**
 * Surface bank-confirm vs checksum failure for batch HTTP layers.
 * @param {object} parsedStatement
 */
export function attachParseOutcomeFlags(parsedStatement) {
  const requiresBank = Boolean(
    parsedStatement.requiresBankConfirmation ??
      parsedStatement.parseResult?.requiresBankConfirmation
  );
  const checksumOk = Boolean(parsedStatement.checksumRecon?.ok);
  const txnCount = (parsedStatement.transactions || []).length;

  let status = 'ok';
  if (requiresBank) {
    status = 'bank_confirmation_required';
  } else if (!checksumOk) {
    status = txnCount > 0 ? 'checksum_failed' : 'no_transactions';
  }

  const outcome = {
    status,
    requiresBankConfirmation: requiresBank,
    checksumOk,
    parseQuality: parsedStatement.parseQuality ?? null,
    txnCount,
    suggestedHttpStatus: requiresBank ? 202 : txnCount === 0 ? 422 : 200
  };

  parsedStatement.parseOutcome = outcome;
  if (parsedStatement.parseResult && typeof parsedStatement.parseResult === 'object') {
    parsedStatement.parseResult.parseOutcome = outcome;
  }
  return outcome;
}

/**
 * @param {Array<object>} parsedStatements
 * @returns {{ httpStatus: number, primaryReason: string, outcomes: object[] }}
 */
export function summarizeBatchParseOutcomes(parsedStatements) {
  const stmts = Array.isArray(parsedStatements) ? parsedStatements : [];
  const outcomes = stmts.map((s) => {
    if (!s.parseOutcome) attachParseOutcomeFlags(s);
    return s.parseOutcome;
  });
  const anyBank = outcomes.some((o) => o?.requiresBankConfirmation);
  const allEmpty = outcomes.length > 0 && outcomes.every((o) => (o?.txnCount ?? 0) === 0);
  const anyChecksumFail = outcomes.some((o) => o?.status === 'checksum_failed');
  if (anyBank) {
    return {
      httpStatus: 202,
      primaryReason: 'bank_confirmation_required',
      outcomes
    };
  }
  if (allEmpty) {
    return {
      httpStatus: 422,
      primaryReason: 'no_transactions',
      outcomes
    };
  }
  return {
    httpStatus: 200,
    primaryReason: anyChecksumFail ? 'checksum_failed' : 'ok',
    outcomes
  };
}

export default {
  buildParseResultForRecon,
  applyLineHintSigns,
  enrichChecksumWithPrintedActivity,
  applyParseQualityPipeline,
  attachChecksumDeltaProbe,
  attachParseOutcomeFlags,
  summarizeBatchParseOutcomes
};
