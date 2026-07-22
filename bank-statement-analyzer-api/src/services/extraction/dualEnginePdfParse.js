/**
 * Cross-reference pdf-parse and pdfplumber extractions on digital PDFs.
 */
import logger from '../../utils/logger.js';
import { validateReconciliation } from '../templateGraduationService.js';
import { reconcileStatement } from './statementReconciliation.js';
import { pdfPlumberEnabled } from './pdfPlumberService.js';
import { tryRecoverChaseFromPlumber } from './profiles/chaseBusinessCompleteProfile.js';
import { tryRecoverRegionsFromPlumber } from './profiles/regionsBusinessCheckingProfile.js';
import { extractDocumentPrintedTotals, mergePrintedWithStitcher } from './printedVitalsService.js';
import { mergePrintedTotals } from '../statementStitcher.js';

const DEPOSIT_AGREEMENT_TOLERANCE = 0.01;

export function dualEngineParseEnabled() {
  if (!pdfPlumberEnabled()) return false;
  const v = process.env.PDFPLUMBER_DUAL_PARSE;
  if (v === 'false' || v === '0') return false;
  return true;
}

/**
 * @param {object} reconInput
 * @returns {{ checksumOk: boolean, delta: number, deposits: number, withdrawals: number, checksumRecon: object }}
 */
export function scoreParseCandidate(reconInput) {
  const checksumRecon = validateReconciliation(reconInput);
  const delta = Number.parseFloat(String(checksumRecon.delta ?? '0')) || 0;
  return {
    checksumOk: Boolean(checksumRecon.ok),
    delta,
    deposits: checksumRecon.deposits,
    withdrawals: checksumRecon.withdrawals,
    checksumRecon
  };
}

/**
 * Sum of absolute drift vs printed deposit/withdrawal totals (lower is better).
 * Falls back to checksum closing delta when printed totals are unavailable.
 * @param {{ delta?: number, deposits?: number, withdrawals?: number }} score
 * @param {{ printedDeposits?: number|null, printedWithdrawals?: number|null }} reconInput
 */
export function aggregatePrintedDelta(score, reconInput) {
  const pd = reconInput?.printedDeposits;
  const pw = reconInput?.printedWithdrawals;
  if (pd == null && pw == null) {
    return Number(score?.delta ?? Infinity);
  }
  let total = 0;
  if (pd != null) {
    total += Math.abs(Number(score?.deposits ?? 0) - Number(pd));
  }
  if (pw != null) {
    total += Math.abs(Number(score?.withdrawals ?? 0) - Number(pw));
  }
  return total;
}

/**
 * @param {object} pdfParseResult
 * @param {Array<object>} transactions
 * @returns {object}
 */
export function buildReconInputFromParseResult(pdfParseResult, transactions) {
  const printed = pdfParseResult?.metadata?.stitcher?.printedSummary;
  const profileRecon = pdfParseResult?.metadata?.profileReconciliation;
  let opening =
    printed?.opening != null ? printed.opening : pdfParseResult?.openingBalance;
  let closing =
    printed?.closing != null ? printed.closing : pdfParseResult?.closingBalance;

  if (opening == null && pdfParseResult?.balances?.opening != null) {
    opening = pdfParseResult.balances.opening;
  }
  if (closing == null && pdfParseResult?.balances?.closing != null) {
    closing = pdfParseResult.balances.closing;
  }

  const printedDeposits =
    profileRecon?.printedDeposits ??
    printed?.totalDeposits ??
    pdfParseResult?.metadata?.printedDeposits ??
    null;
  const printedWithdrawals =
    profileRecon?.printedWithdrawals ??
    printed?.totalWithdrawals ??
    pdfParseResult?.metadata?.printedWithdrawals ??
    null;

  return {
    transactions: transactions || [],
    openingBalance: opening,
    closingBalance: closing,
    balances: { opening, closing },
    printedDeposits,
    printedWithdrawals,
    stitcherVitamins: printed
      ? {
          printedDeposits: printed.totalDeposits,
          printedWithdrawals: printed.totalWithdrawals
        }
      : undefined
  };
}

/**
 * Tier A: arithmetic closing balance. Tier B: also printed section totals when present.
 * @param {object} reconInput from buildReconInputFromParseResult
 * @param {boolean} [useTierB]
 */
export function scoreParseCandidateTiered(reconInput, useTierB = false) {
  const tierA = scoreParseCandidate(reconInput);
  if (!useTierB) return { ...tierA, tier: 'A' };

  const hasPrinted =
    reconInput.printedDeposits != null || reconInput.printedWithdrawals != null;
  if (!hasPrinted) return { ...tierA, tier: 'A' };

  const tierB = reconcileStatement(
    {
      openingBalance: reconInput.openingBalance,
      closingBalance: reconInput.closingBalance,
      printedDeposits: reconInput.printedDeposits,
      printedWithdrawals: reconInput.printedWithdrawals
    },
    reconInput.transactions
  );
  const delta = Math.abs(
    Number(tierB.computedClosing ?? 0) - Number(tierB.closing ?? 0)
  );
  return {
    checksumOk: Boolean(tierB.checksumOk),
    delta,
    deposits: tierB.parsedDeposits,
    withdrawals: tierB.parsedWithdrawals,
    checksumRecon: tierB.checksumRecon ?? tierA.checksumRecon,
    tier: 'B',
    tierB
  };
}

/**
 * @param {object} pdfParseResult
 * @param {{ success?: boolean, transactions?: object[], openingBalance?: number|null, closingBalance?: number|null, metadata?: object, error?: string }|null} plumberResult
 * @param {{ chaseMeta?: object }} [options]
 * @returns {{ transactions: object[], chosenEngine: string, dualEngine: object, changed: boolean }}
 */
export function crossReferenceDualParse(pdfParseResult, plumberResult, options = {}) {
  const pdfTxns = Array.isArray(pdfParseResult?.transactions) ? pdfParseResult.transactions : [];
  const plumberTxns =
    plumberResult?.success && Array.isArray(plumberResult.transactions)
      ? plumberResult.transactions
      : [];

  const useTierB =
    pdfParseResult?.metadata?.extractionProfile === 'chase_business_complete' ||
    pdfParseResult?.metadata?.profileReconciliation != null;

  const pdfRecon = buildReconInputFromParseResult(pdfParseResult, pdfTxns);
  const plumberRecon = buildReconInputFromParseResult(pdfParseResult, plumberTxns);

  if (options.chaseMeta) {
    const cm = options.chaseMeta;
    if (cm.openingBalance != null) {
      pdfRecon.openingBalance = cm.openingBalance;
      plumberRecon.openingBalance = cm.openingBalance;
      pdfRecon.balances.opening = cm.openingBalance;
      plumberRecon.balances.opening = cm.openingBalance;
    }
    if (cm.closingBalance != null) {
      pdfRecon.closingBalance = cm.closingBalance;
      plumberRecon.closingBalance = cm.closingBalance;
      pdfRecon.balances.closing = cm.closingBalance;
      plumberRecon.balances.closing = cm.closingBalance;
    }
    if (cm.printedDeposits != null) {
      pdfRecon.printedDeposits = cm.printedDeposits;
      plumberRecon.printedDeposits = cm.printedDeposits;
    }
    if (cm.printedWithdrawals != null) {
      pdfRecon.printedWithdrawals = cm.printedWithdrawals;
      plumberRecon.printedWithdrawals = cm.printedWithdrawals;
    }
  }

  if (
    plumberResult?.success &&
    plumberResult.openingBalance != null &&
    pdfRecon.openingBalance == null
  ) {
    plumberRecon.openingBalance = plumberResult.openingBalance;
    plumberRecon.balances.opening = plumberResult.openingBalance;
  }
  if (
    plumberResult?.success &&
    plumberResult.closingBalance != null &&
    pdfRecon.closingBalance == null
  ) {
    plumberRecon.closingBalance = plumberResult.closingBalance;
    plumberRecon.balances.closing = plumberResult.closingBalance;
  }

  const pdfScore = scoreParseCandidateTiered(pdfRecon, useTierB);
  const plumberScore =
    plumberTxns.length > 0 ? scoreParseCandidateTiered(plumberRecon, useTierB) : {
      checksumOk: false,
      delta: Infinity,
      deposits: 0,
      withdrawals: 0,
      checksumRecon: null
    };

  const dualEngine = {
    ranPlumber: true,
    plumberTxnCount: plumberTxns.length,
    pdfParseTxnCount: pdfTxns.length,
    pdfParseChecksumOk: pdfScore.checksumOk,
    plumberChecksumOk: plumberScore.checksumOk,
    agreement: null,
    depositDriftPct: null,
    dualEngineBothFailed: false,
    plumberError: plumberResult?.error ?? null
  };

  let chosenEngine = 'pdf_parse';
  let transactions = pdfTxns;
  let changed = false;

  const plumberUsable = plumberResult?.success && plumberTxns.length > 0;

  if (!plumberUsable) {
    chosenEngine = 'pdf_parse';
    dualEngine.chosenEngine = chosenEngine;
    dualEngine.plumberUnavailable = true;
    dualEngine.plumberSkipReason = plumberResult?.error ?? 'empty';
    return { transactions, chosenEngine, dualEngine, changed };
  }

  if (pdfScore.checksumOk && !plumberScore.checksumOk) {
    chosenEngine = 'pdf_parse';
    dualEngine.chosenEngine = chosenEngine;
    return { transactions: pdfTxns, chosenEngine, dualEngine, changed };
  }

  if (!pdfScore.checksumOk && plumberScore.checksumOk) {
    chosenEngine = 'pdfplumber';
    dualEngine.chosenEngine = chosenEngine;
    changed = true;
    return { transactions: plumberTxns, chosenEngine, dualEngine, changed };
  }

  if (pdfScore.checksumOk && plumberScore.checksumOk) {
    const maxDep = Math.max(pdfScore.deposits, plumberScore.deposits, 1);
    const drift = Math.abs(pdfScore.deposits - plumberScore.deposits) / maxDep;
    dualEngine.depositDriftPct = Number((drift * 100).toFixed(4));
    dualEngine.agreement = drift <= DEPOSIT_AGREEMENT_TOLERANCE;

    // Stable tie-break: prefer coordinate/plumber provenance over text.
    // Never select by highest transaction count.
    chosenEngine = 'pdfplumber';
    dualEngine.chosenEngine = chosenEngine;
    dualEngine.selectionRule = 'verified_tiebreak_plumber_preferred';
    changed = true;
    return { transactions: plumberTxns, chosenEngine, dualEngine, changed };
  }

  dualEngine.dualEngineBothFailed = true;

  const pdfPickDelta = aggregatePrintedDelta(pdfScore, pdfRecon);
  const plumberPickDelta = aggregatePrintedDelta(plumberScore, plumberRecon);
  dualEngine.pdfAggregateDelta = pdfPickDelta;
  dualEngine.plumberAggregateDelta = plumberPickDelta;

  if (pdfTxns.length === 0 && plumberTxns.length > 0) {
    chosenEngine = 'pdfplumber';
    transactions = plumberTxns;
    changed = true;
    dualEngine.chosenEngine = chosenEngine;
    dualEngine.fallbackEmptyPdfParse = true;
    return { transactions, chosenEngine, dualEngine, changed };
  }

  if (plumberTxns.length > 0 && plumberPickDelta < pdfPickDelta) {
    chosenEngine = 'pdfplumber';
    transactions = plumberTxns;
    changed = true;
    dualEngine.chosenEngine = chosenEngine;
    dualEngine.fallbackLowerAggregateDelta = true;
    return { transactions, chosenEngine, dualEngine, changed };
  }

  chosenEngine = 'pdf_parse';
  dualEngine.chosenEngine = chosenEngine;
  dualEngine.fallbackLowerAggregateDelta = pdfPickDelta <= plumberPickDelta;
  return { transactions: pdfTxns, chosenEngine, dualEngine, changed };
}

/**
 * @param {object} pdfParseResult
 * @param {{ success?: boolean, transactions?: object[], openingBalance?: number|null, closingBalance?: number|null, metadata?: object, error?: string }|null} plumberResult
 * @param {{ fileName?: string, correlationId?: string, onProgress?: (payload: object) => void, text?: string, defaultYear?: number, rtn?: string, accountNumber?: string, stitcherPrinted?: object, typeAText?: string }} [context]
 * @returns {object}
 */
export function applyDualEngineToParseResult(pdfParseResult, plumberResult, context = {}) {
  if (!dualEngineParseEnabled() || !pdfParseResult) {
    return pdfParseResult;
  }

  if (context.correlationId && context.onProgress) {
    context.onProgress({
      phase: 'dual_engine_parse',
      fileName: context.fileName,
      message: context.fileName
        ? `Cross-checking spatial tables for ${context.fileName}…`
        : 'Cross-checking spatial tables…'
    });
  }

  let pdfForMerge = pdfParseResult;
  let plumberForMerge = plumberResult;
  let crossOptions = {};

  const isChase =
    pdfParseResult?.metadata?.extractionProfile === 'chase_business_complete' ||
    pdfParseResult?.metadata?.profileId === 'chase_business_complete';

  const isRegions =
    pdfParseResult?.metadata?.extractionProfile === 'regions_business_checking' ||
    pdfParseResult?.metadata?.profileId === 'regions_business_checking';

  const isGeneric =
    pdfParseResult?.metadata?.extractionProfile === 'generic_digital' ||
    pdfParseResult?.metadata?.profileId === 'generic_digital';

  if (isChase && plumberResult?.transactions?.length && context.text) {
    const recovered = tryRecoverChaseFromPlumber({
      plumberTransactions: plumberResult.transactions,
      text: context.text,
      defaultYear: context.defaultYear,
      rtn: context.rtn,
      accountNumber: context.accountNumber,
      stitcherPrinted: context.stitcherPrinted,
      typeAText: context.typeAText
    });
    if (recovered?.transactions?.length) {
      plumberForMerge = {
        ...plumberResult,
        transactions: recovered.transactions,
        success: true
      };
      crossOptions = { chaseMeta: recovered.meta };
      if (recovered.meta) {
        pdfForMerge = {
          ...pdfParseResult,
          openingBalance: pdfParseResult.openingBalance ?? recovered.meta.openingBalance,
          closingBalance: pdfParseResult.closingBalance ?? recovered.meta.closingBalance,
          metadata: {
            ...(pdfParseResult.metadata || {}),
            profileReconciliation: {
              printedDeposits: recovered.meta.printedDeposits,
              printedWithdrawals: recovered.meta.printedWithdrawals,
              openingBalance: recovered.meta.openingBalance,
              closingBalance: recovered.meta.closingBalance
            }
          }
        };
      }
    }
  }

  if (isRegions && plumberResult?.transactions?.length && context.text) {
    const recovered = tryRecoverRegionsFromPlumber({
      plumberTransactions: plumberResult.transactions,
      text: context.text,
      defaultYear: context.defaultYear,
      rtn: context.rtn,
      accountNumber: context.accountNumber,
      stitcherPrinted: context.stitcherPrinted,
      typeAText: context.typeAText
    });
    if (
      (recovered?.checksumOk || recovered?.reconciliation?.checksumRecon?.ok) &&
      recovered?.transactions?.length
    ) {
      plumberForMerge = {
        ...plumberResult,
        transactions: recovered.transactions,
        success: true
      };
      crossOptions = { chaseMeta: recovered.meta };
      if (recovered.meta) {
        pdfForMerge = {
          ...pdfParseResult,
          openingBalance: pdfParseResult.openingBalance ?? recovered.meta.openingBalance,
          closingBalance: pdfParseResult.closingBalance ?? recovered.meta.closingBalance,
          metadata: {
            ...(pdfParseResult.metadata || {}),
            extractionProfile: 'regions_business_checking',
            profileId: 'regions_business_checking',
            profileReconciliation: {
              printedDeposits: recovered.meta.printedDeposits,
              printedWithdrawals: recovered.meta.printedWithdrawals,
              openingBalance: recovered.meta.openingBalance,
              closingBalance: recovered.meta.closingBalance
            }
          }
        };
      }
    }
  }

  if (
    isGeneric &&
    plumberResult?.transactions?.length &&
    context.text &&
    (!pdfParseResult?.transactions?.length || pdfParseResult.transactions.length === 0)
  ) {
    const mergedPrinted = mergePrintedTotals(
      context.stitcherPrinted ?? {},
      context.typeAText || context.text
    );
    const docTotals = extractDocumentPrintedTotals(context.text);
    const vitals = mergePrintedWithStitcher(
      {
        openingBalance: pdfParseResult.openingBalance ?? docTotals?.openingBalance ?? null,
        closingBalance: pdfParseResult.closingBalance ?? docTotals?.closingBalance ?? null,
        printedDeposits: docTotals?.printedDeposits ?? null,
        printedWithdrawals: docTotals?.printedWithdrawals ?? null
      },
      mergedPrinted
    );
    if (vitals) {
      crossOptions = {
        ...crossOptions,
        chaseMeta: {
          openingBalance: vitals.openingBalance,
          closingBalance: vitals.closingBalance,
          printedDeposits: vitals.printedDeposits,
          printedWithdrawals: vitals.printedWithdrawals
        }
      };
      pdfForMerge = {
        ...pdfParseResult,
        openingBalance: pdfParseResult.openingBalance ?? vitals.openingBalance,
        closingBalance: pdfParseResult.closingBalance ?? vitals.closingBalance,
        metadata: {
          ...(pdfParseResult.metadata || {}),
          profileReconciliation: {
            printedDeposits: vitals.printedDeposits,
            printedWithdrawals: vitals.printedWithdrawals,
            openingBalance: vitals.openingBalance,
            closingBalance: vitals.closingBalance
          }
        }
      };
    }
  }

  const { transactions, chosenEngine, dualEngine, changed } = crossReferenceDualParse(
    pdfForMerge,
    plumberForMerge,
    crossOptions
  );

  dualEngine.chosenEngine = chosenEngine;

  const meta = { ...(pdfParseResult.metadata || {}) };
  meta.dualEngine = dualEngine;
  meta.extractionEngine = chosenEngine;
  if (dualEngine.agreement) meta.dualEngineAgreement = true;

  if (chosenEngine === 'pdfplumber' && plumberResult?.metadata) {
    Object.assign(meta, plumberResult.metadata);
    meta.usedPdfPlumber = true;
  }

  if (changed) {
    meta.templateCoordinateStatus = 'DUAL_ENGINE_MERGED';
  }

  let openingBalance = pdfParseResult.openingBalance;
  let closingBalance = pdfParseResult.closingBalance;
  if (
    chosenEngine === 'pdfplumber' &&
    plumberResult?.openingBalance != null &&
    openingBalance == null
  ) {
    openingBalance = plumberResult.openingBalance;
  }
  if (
    chosenEngine === 'pdfplumber' &&
    plumberResult?.closingBalance != null &&
    closingBalance == null
  ) {
    closingBalance = plumberResult.closingBalance;
  }

  const balances = {
    ...(pdfParseResult.balances || {}),
    opening: openingBalance ?? pdfParseResult.balances?.opening,
    closing: closingBalance ?? pdfParseResult.balances?.closing
  };

  logger.info('[DUAL_ENGINE] merge decision', {
    fileName: context.fileName ?? null,
    chosenEngine,
    changed,
    pdfParseTxnCount: dualEngine.pdfParseTxnCount,
    plumberTxnCount: dualEngine.plumberTxnCount,
    pdfParseChecksumOk: dualEngine.pdfParseChecksumOk,
    plumberChecksumOk: dualEngine.plumberChecksumOk,
    agreement: dualEngine.agreement,
    dualEngineBothFailed: dualEngine.dualEngineBothFailed
  });

  return {
    ...pdfParseResult,
    transactions,
    openingBalance,
    closingBalance,
    balances,
    metadata: meta
  };
}

export default {
  dualEngineParseEnabled,
  scoreParseCandidate,
  buildReconInputFromParseResult,
  crossReferenceDualParse,
  applyDualEngineToParseResult
};
