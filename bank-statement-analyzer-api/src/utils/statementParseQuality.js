import { validateReconciliation } from '../services/templateGraduationService.js';
import { validateRowRunningBalances } from '../services/extraction/statementReconciliation.js';
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
  normalizeTransactionsWithBalanceInference
} from './transactionNormalization.js';
import { runChecksumDeltaProbe } from './checksumDeltaProbe.js';
import { isLedgerInflow } from './transactionNormalization.js';
import { validateStatement } from './statementValidator.js';
import logger from './logger.js';
import pdfParse from 'pdf-parse';
import {
  buildParseDiagnosticReport,
  dedupeExactFingerprints,
  parseDebugEnabled
} from './parseDiagnosticReport.js';
import { validateData } from '../validation/validateData.js';
import { checksumReconSchema } from '../validation/checksumReconSchema.js';
import { parseDiagnosticSchema } from '../validation/parseDiagnosticSchema.js';

/**
 * Flip positive amounts on debit-hint lines when balance inference did not sign them.
 * @param {Array<object>} transactions
 * @returns {Array<object>}
 */
export function applyLineHintSigns(transactions) {
  if (!Array.isArray(transactions)) return [];
  return transactions.map((tx) => {
    if (!tx || typeof tx !== 'object') return tx;
    const line = String(tx.rawLine || tx.description || '');
    const amt = Number(tx.amount);
    if (!Number.isFinite(amt) || amt === 0) return tx;

    let next = { ...tx };
    if (amt > 0 && lineHintsDebitForMergedPdf(line)) {
      next = { ...next, amount: -Math.abs(amt), type: 'debit' };
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
  const opening =
    printed?.opening != null ? printed.opening : parsedStatement.openingBalance;
  const closing =
    printed?.closing != null ? printed.closing : parsedStatement.closingBalance;

  return {
    transactions: parsedStatement.transactions || [],
    openingBalance: opening,
    closingBalance: closing,
    balances: { opening, closing },
    stitcherVitamins: printed
      ? {
          printedDeposits: printed.totalDeposits,
          printedWithdrawals: printed.totalWithdrawals,
          footer: parsedStatement.parseResult?.metadata?.stitcher?.footer
        }
      : undefined
  };
}

/**
 * Sanitize → normalize → checksum + row micro-checksum; mutates parsedStatement in place.
 * @returns {{ checksumRecon: object, rowBalanceRecon: object, parseQuality: 'OK'|'FAILED_CHECKSUM', parseSanityStats: object }}
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

  const checksumRecon = validateReconciliation(reconInput);
  const reconValidation = validateData(checksumReconSchema, checksumRecon, { label: 'applyParseQualityPipeline.checksumRecon' });
  if (!reconValidation.ok) { logger.warn('checksumRecon validation failed', { errors: reconValidation.errors.slice(0, 3) }); }
  parsedStatement.checksumRecon = checksumRecon;

  const rowBalanceRecon = validateRowRunningBalances(normalized, {
    openingBalance: parsedStatement.openingBalance ?? reconInput.openingBalance
  });
  parsedStatement.rowBalanceRecon = rowBalanceRecon;

  const validationReport = validateStatement(parsedStatement, {
    pdfMeta: { numpages: parsedStatement.parseResult?.metadata?.pageCount }
  });
  parsedStatement.validationReport = validationReport;

  parsedStatement.validationOk = validationReport.overallOk;
  // Macro/batch gates use arithmetic reconciliation; structural/temporal tiers are advisory.
  // Row micro-checksum failures open HITL separately via rowBalanceRecon (do not flip parseQuality alone).
  const parseQualityOk = checksumRecon.ok;
  parsedStatement.parseQuality = parseQualityOk ? 'OK' : 'FAILED_CHECKSUM';

  if (parseDebugEnabled() || !checksumRecon.ok || !rowBalanceRecon.ok) {
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
    const diagValidation = validateData(parseDiagnosticSchema, parsedStatement.parseDiagnostic, { label: 'applyParseQualityPipeline.parseDiagnostic' });
    if (!diagValidation.ok) { logger.warn('parseDiagnostic validation failed', { errors: diagValidation.errors.slice(0, 3) }); }
    if (!checksumRecon.ok) {
      logger.warn('[PARSE_DIAGNOSTIC] Checksum failed', {
        fileName: parsedStatement.fileName,
        delta: checksumRecon.delta,
        txnCount: normalized.length
      });
    }
    if (!rowBalanceRecon.ok) {
      logger.warn('[PARSE_DIAGNOSTIC] Row balance micro-checksum failed', {
        fileName: parsedStatement.fileName,
        violationCount: rowBalanceRecon.violations.length,
        first: rowBalanceRecon.violations[0] || null
      });
    }
  }

  attachParseOutcomeFlags(parsedStatement);

  const printedDep = reconInput.stitcherVitamins?.printedDeposits;
  if (printedDep != null && Number.isFinite(printedDep) && printedDep > 0) {
    let sumDep = 0;
    for (const tx of parsedStatement.transactions || []) {
      if (tx?.excludeFromMacroTotals) continue;
      const n = Number(tx.amount);
      if (Number.isFinite(n) && isLedgerInflow({ amount: n, type: tx.type })) sumDep += Math.abs(n);
    }
    const drift = Math.abs(sumDep - printedDep) / printedDep;
    if (drift > 0.01) {
      logger.warn('[PARSE_QUALITY] Type B deposits drift from Type A printed total', {
        fileName: parsedStatement.fileName,
        sumDeposits: sumDep,
        printedDeposits: printedDep,
        driftPct: (drift * 100).toFixed(2)
      });
    }
  }

  return {
    checksumRecon,
    rowBalanceRecon,
    parseQuality: parsedStatement.parseQuality,
    parseSanityStats: stats
  };
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
  applyParseQualityPipeline,
  attachChecksumDeltaProbe,
  attachParseOutcomeFlags,
  summarizeBatchParseOutcomes
};
