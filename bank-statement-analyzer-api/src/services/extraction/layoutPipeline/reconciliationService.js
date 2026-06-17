/**
 * Pass 2b — sole checksum owner for layout-first pipeline.
 */

import { reconcileStatement, validateEndingDailyBalancePlacement } from '../statementReconciliation.js';
import riskAnalysisService from '../../riskAnalysisService.js';

export const TOLERANCE = 0.01;

/**
 * @param {object} recon
 * @returns {object}
 */
export function computeReconciliationDelta(recon) {
  if (!recon) return { depositDelta: null, withdrawalDelta: null, closingDelta: null, lineDeltas: {} };
  return {
    depositDelta:
      recon.printedDeposits != null
        ? Number((recon.parsedDeposits - recon.printedDeposits).toFixed(2))
        : null,
    withdrawalDelta:
      recon.printedWithdrawals != null
        ? Number((recon.parsedWithdrawals - recon.printedWithdrawals).toFixed(2))
        : null,
    closingDelta:
      recon.closing != null
        ? Number((recon.computedClosing - recon.closing).toFixed(2))
        : null,
    lineDeltas: recon.lineDeltas ?? {}
  };
}

/**
 * @param {object} rawBundle
 * @returns {object}
 */
export function reconcileRawBundle(rawBundle) {
  const meta = { ...(rawBundle.meta ?? {}) };
  const mainTxns = rawBundle.transactions ?? [];
  const feeTxns = rawBundle.feeTransactions ?? [];
  const hasSpec = Boolean(meta.reconciliationSpec);

  let ledger = mainTxns;
  let feeWithdrawals = 0;

  if (hasSpec) {
    // Spec-aware: fold fee rows into one section-tagged ledger as debits.
    // printedWithdrawals already accounts for fees/checks via spec roles, so we
    // do NOT inflate the printed total here (that would double-count).
    const taggedFees = feeTxns.map((t) => ({
      ...t,
      amount: -Math.abs(Number(t.amount) || 0),
      section: t.section ?? t.sectionLabel ?? 'fees'
    }));
    feeWithdrawals = taggedFees.reduce((s, t) => s + Math.abs(Number(t.amount)), 0);
    ledger = [...mainTxns, ...taggedFees];
  } else {
    // Legacy two-bucket: fold fee withdrawals into the printed total.
    feeWithdrawals = feeTxns
      .filter((t) => Number(t.amount) >= 0)
      .reduce((s, t) => s + Math.abs(Number(t.amount)), 0);
    if (feeWithdrawals > 0 && meta.printedWithdrawals != null) {
      meta.printedWithdrawals = Number(meta.printedWithdrawals) + feeWithdrawals;
    }
  }

  const reconciliation = reconcileStatement(meta, ledger);
  const delta = computeReconciliationDelta(reconciliation);

  const endingDaily = validateEndingDailyBalancePlacement(
    rawBundle.normalizedTransactions ?? []
  );

  return {
    ...reconciliation,
    reconciliationBreakdown: reconciliation,
    delta,
    feeLedgerMerged: feeTxns.length > 0,
    feeWithdrawalsMerged: feeWithdrawals,
    endingDailyBalanceValid: endingDaily.valid,
    endingDailyViolations: endingDaily.violations
  };
}

/** @deprecated use reconcileRawBundle */
export function reconcile(meta, transactions) {
  return reconcileStatement(meta, transactions);
}

export default {
  TOLERANCE,
  computeReconciliationDelta,
  reconcileRawBundle,
  reconcile
};
