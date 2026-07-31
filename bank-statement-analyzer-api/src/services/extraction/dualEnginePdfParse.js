/**
 * Cross-reference pdf-parse and pdfplumber extractions on digital PDFs.
 */
import logger from '../../utils/logger.js';
import { validateReconciliation } from '../templateGraduationService.js';
import { reconcileStatement } from './statementReconciliation.js';
import { pdfPlumberEnabled } from './pdfPlumberService.js';
import { tryRecoverChaseFromPlumber } from './profiles/chaseBusinessCompleteProfile.js';
import { extractDocumentPrintedTotals, mergePrintedWithStitcher } from './printedVitalsService.js';
import { mergePrintedTotals } from '../statementStitcher.js';

const DEPOSIT_AGREEMENT_TOLERANCE = 0.01;

/**
 * Deterministic candidate ranking for the dual-engine selector.
 *
 * Order: checksum pass → lowest absolute delta → fewer duplicate
 * fingerprints → higher balance coverage → fewer unresolved items →
 * source preference (repaired plumber over raw profile fallback; rejected
 * repairs are demoted below the pipeline candidate).
 */
const SOURCE_PRIORITY = {
  plumber_repaired: 0,
  pipeline: 1,
  plumber_base: 2,
  plumber_raw: 3,
};

// A rejected/errored repair must never win a tie against the pipeline
// candidate: the rescue already decided it did not improve the ledger.
function sourcePriorityOf(candidate) {
  if (
    candidate.source === 'plumber_repaired' &&
    (candidate.rescueOutcome === 'RESCUE_REJECTED' ||
      candidate.rescueOutcome === 'RESCUE_ERROR')
  ) {
    return 4;
  }
  return SOURCE_PRIORITY[candidate.source] ?? 9;
}

export function countDuplicateFingerprints(transactions) {
  const seen = new Map();
  let duplicates = 0;
  for (const t of transactions || []) {
    const fp =
      t.rowFingerprint ??
      t.fingerprint ??
      `${t.date ?? ''}|${t.description ?? ''}|${t.amount ?? ''}`;
    const n = (seen.get(fp) || 0) + 1;
    seen.set(fp, n);
    if (n === 2) duplicates += 1;
    else if (n > 2) duplicates += 1;
  }
  return duplicates;
}

export function balanceCoverageOf(transactions) {
  const withBalance = (transactions || []).filter(
    (t) => t.balance != null || t.endingDailyBalance != null
  ).length;
  return transactions?.length ? withBalance / transactions.length : 0;
}

/**
 * Comparable score object for one selector candidate.
 * @param {object} args
 * @param {string} args.id — candidate id (e.g. 'pdf_parse', 'pdfplumber')
 * @param {string} args.source — candidate source class (pipeline / plumber_repaired / plumber_base / plumber_raw)
 * @param {object[]} args.transactions
 * @param {object} args.reconInput — from buildReconInputFromParseResult
 * @param {boolean} [args.useTierB]
 * @param {string|null} [args.rescueOutcome]
 * @param {number} [args.unresolvedItemCount] — dropped + uncertain count
 */
export function buildCandidateScore({
  id,
  source,
  transactions,
  reconInput,
  useTierB = false,
  rescueOutcome = null,
  unresolvedItemCount = 0,
}) {
  const score = scoreParseCandidateTiered(reconInput, useTierB);
  return {
    id,
    source,
    checksumOk: Boolean(score.checksumOk),
    delta: Math.abs(Number(score.delta) || 0),
    balanceEquationOk: Boolean(score.checksumOk),
    duplicateFingerprintCount: countDuplicateFingerprints(transactions),
    balanceCoverage: balanceCoverageOf(transactions),
    unresolvedItemCount: Number(unresolvedItemCount) || 0,
    rescueOutcome,
    deposits: score.deposits,
    withdrawals: score.withdrawals,
    checksumRecon: score.checksumRecon,
    transactions,
  };
}

/**
 * Deterministic ranking. Mutates nothing; returns a new sorted array.
 * @param {object[]} candidates — buildCandidateScore outputs
 */
export function rankCandidates(candidates) {
  return [...candidates].sort((a, b) => {
    if (a.checksumOk !== b.checksumOk) return a.checksumOk ? -1 : 1;
    if (a.delta !== b.delta) return a.delta - b.delta;
    if (a.duplicateFingerprintCount !== b.duplicateFingerprintCount) {
      return a.duplicateFingerprintCount - b.duplicateFingerprintCount;
    }
    if (a.balanceCoverage !== b.balanceCoverage) {
      return b.balanceCoverage - a.balanceCoverage;
    }
    if (a.unresolvedItemCount !== b.unresolvedItemCount) {
      return a.unresolvedItemCount - b.unresolvedItemCount;
    }
    // Source preference is the FINAL tie-break (spec: prefer the repaired
    // plumber candidate over raw profile fallback on equal scores). Rejected
    // repairs are demoted inside sourcePriorityOf so a refused repair can
    // never win a tie against the pipeline candidate.
    const ap = sourcePriorityOf(a);
    const bp = sourcePriorityOf(b);
    return ap - bp;
  });
}

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
 * Rescue-aware candidate selection: scores the pipeline candidate, the raw
 * plumber candidate, and every rescue candidate (plumber_repaired /
 * plumber_base) with the SAME comparable metric, then picks the winner
 * deterministically via rankCandidates.
 */
function selectRescueAware({
  pdfParseResult,
  pdfTxns,
  plumberResult,
  plumberTxns,
  useTierB,
  rescueCandidates,
}) {
  const unresolvedCount =
    (plumberResult?.droppedRows?.length ?? 0) +
    (plumberResult?.uncertainAssignments?.length ?? 0);

  const candidates = [];

  // 1. Pipeline candidate (what the rescue produced / kept as base).
  if (pdfTxns.length) {
    candidates.push(
      buildCandidateScore({
        id: 'pdf_parse',
        source: 'pipeline',
        transactions: pdfTxns,
        reconInput: buildReconInputFromParseResult(pdfParseResult, pdfTxns),
        useTierB,
        rescueOutcome: pdfParseResult?.metadata?.rescueOutcome ?? null,
        unresolvedItemCount: unresolvedCount,
      })
    );
  }

  // 2. Raw plumber candidate (pre-rescue branch).
  if (plumberTxns.length) {
    candidates.push(
      buildCandidateScore({
        id: 'pdfplumber_raw',
        source: 'plumber_raw',
        transactions: plumberTxns,
        reconInput: buildReconInputFromParseResult(pdfParseResult, plumberTxns),
        useTierB,
        rescueOutcome: null,
        unresolvedItemCount: unresolvedCount,
      })
    );
  }

  // 3. Rescue candidates — the repaired plumber ledger AND the base ledger
  //    the rescue compared against. Each is a first-class contender.
  for (const rc of rescueCandidates || []) {
    if (!rc?.transactions?.length) continue;
    candidates.push(
      buildCandidateScore({
        id: rc.id ?? rc.source,
        source: rc.source,
        transactions: rc.transactions,
        reconInput: buildReconInputFromParseResult(pdfParseResult, rc.transactions),
        useTierB,
        rescueOutcome: rc.rescueOutcome ?? null,
        unresolvedItemCount: unresolvedCount,
      })
    );
  }

  const ranked = rankCandidates(candidates);
  const winner = ranked[0];

  const dualEngine = {
    ranPlumber: true,
    plumberTxnCount: plumberTxns.length,
    pdfParseTxnCount: pdfTxns.length,
    pdfParseChecksumOk: Boolean(
      candidates.find((c) => c.id === 'pdf_parse')?.checksumOk
    ),
    plumberChecksumOk: Boolean(
      candidates.find((c) => c.id === 'pdfplumber_raw')?.checksumOk
    ),
    agreement: null,
    depositDriftPct: null,
    dualEngineBothFailed: !ranked.some((c) => c.checksumOk),
    plumberError: plumberResult?.error ?? null,
    rescueAwareSelection: true,
    candidates: ranked.map((c) => ({
      id: c.id,
      source: c.source,
      checksumOk: c.checksumOk,
      delta: c.delta,
      balanceEquationOk: c.balanceEquationOk,
      duplicateFingerprintCount: c.duplicateFingerprintCount,
      balanceCoverage: c.balanceCoverage,
      unresolvedItemCount: c.unresolvedItemCount,
      rescueOutcome: c.rescueOutcome,
    })),
    winner: {
      id: winner.id,
      source: winner.source,
      rescueOutcome: winner.rescueOutcome,
      delta: winner.delta,
      checksumOk: winner.checksumOk,
    },
  };

  const chosenEngine =
    winner.source === 'pipeline' ? 'pdf_parse' : 'pdfplumber';
  const changed = winner.source !== 'pipeline';
  dualEngine.chosenEngine = chosenEngine;
  dualEngine.winnerReconciliation = winner.checksumRecon;

  logger.info('[DUAL_ENGINE] rescue-aware selection', {
    chosenEngine,
    changed,
    winner: dualEngine.winner,
    candidateCount: ranked.length,
    bothFailed: dualEngine.dualEngineBothFailed,
  });

  return {
    transactions: winner.transactions,
    chosenEngine,
    dualEngine,
    changed,
  };
}

/**
 * @param {object} pdfParseResult
 * @param {{ success?: boolean, transactions?: object[], openingBalance?: number|null, closingBalance?: number|null, metadata?: object, error?: string }|null} plumberResult
 * @param {{ chaseMeta?: object, rescueCandidates?: object[] }} [options]
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

  // ── Rescue-aware selection (candidate overlay) ─────────────────────────────
  // When the pipeline produced rescue candidates (plumber_repaired /
  // plumber_base), score EVERY candidate with the same comparable metric
  // and pick the winner deterministically. The repaired plumber candidate
  // is a first-class contender here — the raw profile branch must not
  // automatically override a better repaired candidate.
  if (options.rescueCandidates?.length) {
    return selectRescueAware({
      pdfParseResult,
      pdfTxns,
      plumberResult,
      plumberTxns,
      useTierB,
      rescueCandidates: options.rescueCandidates,
    });
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

    if (dualEngine.agreement) {
      chosenEngine = 'pdf_parse';
      dualEngine.chosenEngine = chosenEngine;
      return { transactions: pdfTxns, chosenEngine, dualEngine, changed };
    }

    if (plumberScore.delta < pdfScore.delta) {
      chosenEngine = 'pdfplumber';
      dualEngine.chosenEngine = chosenEngine;
      changed = true;
      return { transactions: plumberTxns, chosenEngine, dualEngine, changed };
    }

    chosenEngine = 'pdf_parse';
    dualEngine.chosenEngine = chosenEngine;
    return { transactions: pdfTxns, chosenEngine, dualEngine, changed };
  }

  dualEngine.dualEngineBothFailed = true;

  // ---- Balance-aware preference (P0) ----
  // When both fail checksum, prefer the engine with REAL balance data
  // (balance differs from transaction amount by > $1 — meaning it's a running
  // balance, not a duplicate of the transaction amount).
  const hasRealBalance = (txns) => txns.some(t => {
    const bal = t.balance ?? t.endingDailyBalance;
    if (bal == null) return false;
    return Math.abs(bal - Math.abs(t.amount ?? 0)) > 1.0;
  });
  const plumberRealBalCount = plumberTxns.filter(t => {
    const bal = t.balance ?? t.endingDailyBalance;
    if (bal == null) return false;
    return Math.abs(bal - Math.abs(t.amount ?? 0)) > 1.0;
  }).length;
  const pdfRealBalCount = pdfTxns.filter(t => {
    const bal = t.balance ?? t.endingDailyBalance;
    if (bal == null) return false;
    return Math.abs(bal - Math.abs(t.amount ?? 0)) > 1.0;
  }).length;
  logger.info('[DUAL_ENGINE] balance check', {
    plumberRealBalCount,
    pdfRealBalCount,
    plumberTxnCount: plumberTxns.length,
  });
  // Prefer the engine with significantly more real balance data
  if (plumberRealBalCount > pdfRealBalCount * 1.5 && plumberTxns.length > 0) {
    chosenEngine = 'pdfplumber';
    transactions = plumberTxns;
    changed = true;
    dualEngine.chosenEngine = chosenEngine;
    dualEngine.fallbackBalancePreference = true;
    return { transactions, chosenEngine, dualEngine, changed };
  }

  if (pdfTxns.length === 0 && plumberTxns.length > 0) {
    chosenEngine = 'pdfplumber';
    transactions = plumberTxns;
    changed = true;
    dualEngine.chosenEngine = chosenEngine;
    dualEngine.fallbackEmptyPdfParse = true;
    return { transactions, chosenEngine, dualEngine, changed };
  }

  if (plumberTxns.length > 0 && plumberScore.delta < pdfScore.delta) {
    chosenEngine = 'pdfplumber';
    transactions = plumberTxns;
    changed = true;
    dualEngine.chosenEngine = chosenEngine;
    dualEngine.fallbackLowerTierADelta = true;
    return { transactions, chosenEngine, dualEngine, changed };
  }

  chosenEngine = 'pdf_parse';
  dualEngine.chosenEngine = chosenEngine;
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

  // Rescue candidate overlay from the pipeline: plumber_repaired /
  // plumber_base ledgers the rescue evaluated. Passed to the selector so
  // the repaired plumber candidate is scored, not just the raw branch.
  if (context.rescueCandidates?.length) {
    crossOptions.rescueCandidates = context.rescueCandidates;
  }

  const isChase =
    pdfParseResult?.metadata?.extractionProfile === 'chase_business_complete' ||
    pdfParseResult?.metadata?.profileId === 'chase_business_complete';

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

  // Propagate the winner's rescue outcome into final parse metadata so
  // every downstream surface (controller, Vera, harness) sees what the
  // selector actually chose. Must run AFTER the plumber metadata merge so
  // the raw plumber branch cannot clobber the selector's decision.
  if (dualEngine.winner?.rescueOutcome) {
    meta.rescueOutcome = dualEngine.winner.rescueOutcome;
  }
  if (dualEngine.winnerReconciliation) {
    meta.winnerReconciliation = dualEngine.winnerReconciliation;
  }
  if (dualEngine.candidates?.length) {
    meta.candidateScores = dualEngine.candidates;
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

  const rawWordRows = plumberResult?.rawWordRows ?? pdfParseResult?.rawWordRows ?? [];

  return {
    ...pdfParseResult,
    transactions,
    openingBalance,
    closingBalance,
    balances,
    metadata: meta,
    rawWordRows,
    fallback:
      !transactions?.length && rawWordRows.length
        ? {
            mode: 'raw_word',
            note: 'Layout not recognized. Raw word ledger provided for manual review or AI reconstruction.',
            rawWordRowCount: rawWordRows.length,
          }
        : null,
  };
}

export default {
  dualEngineParseEnabled,
  scoreParseCandidate,
  buildReconInputFromParseResult,
  countDuplicateFingerprints,
  balanceCoverageOf,
  buildCandidateScore,
  rankCandidates,
  crossReferenceDualParse,
  applyDualEngineToParseResult
};
