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
  if (!recon) return { depositDelta: null, withdrawalDelta: null, closingDelta: null };
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
        : null
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

  const feeDeposits = feeTxns
    .filter((t) => Number(t.amount) < 0)
    .reduce((s, t) => s + Math.abs(Number(t.amount)), 0);
  const feeWithdrawals = feeTxns
    .filter((t) => Number(t.amount) >= 0)
    .reduce((s, t) => s + Math.abs(Number(t.amount)), 0);

  if (feeWithdrawals > 0 && meta.printedWithdrawals != null) {
    meta.printedWithdrawals = Number(meta.printedWithdrawals) + feeWithdrawals;
  }

  const reconciliation = reconcileStatement(meta, mainTxns);
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
