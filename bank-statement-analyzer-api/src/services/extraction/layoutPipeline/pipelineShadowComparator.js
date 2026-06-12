/**
 * Compare legacy parse vs layout-first shadow metrics.
 */

import riskAnalysisService from '../../riskAnalysisService.js';

/**
 * @param {object} legacy
 * @param {object} layoutFirst
 * @returns {object}
 */
export function comparePipelineShadow(legacy, layoutFirst) {
  const legacyTxns = legacy?.transactions ?? [];
  const newTxns = layoutFirst?.transactions ?? layoutFirst?.rawBundle?.transactions ?? [];

  const legacyTotals =
    riskAnalysisService.calculateTotalDepositsAndWithdrawals(legacyTxns);
  const newTotals = riskAnalysisService.calculateTotalDepositsAndWithdrawals(newTxns);

  const legacyRecon = legacy?.reconciliation ?? {};
  const newRecon =
    layoutFirst?.reconciliation?.reconciliationBreakdown ??
    layoutFirst?.reconciliation ??
    {};

  const checksumOkLegacy = Boolean(legacyRecon.checksumOk ?? legacyRecon.ok);
  const checksumOkLayoutFirst = Boolean(newRecon.checksumOk ?? newRecon.ok);
  const depositDelta =
    newTotals.totalDeposits != null && legacyTotals.totalDeposits != null
      ? Number((newTotals.totalDeposits - legacyTotals.totalDeposits).toFixed(2))
      : null;
  const withdrawalDelta =
    newTotals.totalWithdrawals != null && legacyTotals.totalWithdrawals != null
      ? Number((newTotals.totalWithdrawals - legacyTotals.totalWithdrawals).toFixed(2))
      : null;

  const legacyInflation =
    legacyRecon.printedDeposits > 0
      ? legacyTotals.totalDeposits / legacyRecon.printedDeposits
      : null;
  const newInflation =
    newRecon.printedDeposits > 0 ? newTotals.totalDeposits / newRecon.printedDeposits : null;

  const layoutFirstWins =
    checksumOkLayoutFirst && !checksumOkLegacy
      ? true
      : checksumOkLayoutFirst === checksumOkLegacy
        ? newTxns.length >= legacyTxns.length
        : false;

  const promoteCandidate =
    layoutFirstWins &&
    checksumOkLayoutFirst &&
    Math.abs(depositDelta ?? 0) < 50000;

  return {
    checksumOkLegacy,
    checksumOkLayoutFirst,
    checksumMatch: checksumOkLegacy === checksumOkLayoutFirst,
    txnCountDelta: newTxns.length - legacyTxns.length,
    legacyTxnCount: legacyTxns.length,
    newTxnCount: newTxns.length,
    depositDelta,
    withdrawalDelta,
    profileIdLegacy: legacy?.profileId ?? legacy?.metadata?.extractionProfile ?? null,
    profileIdLayoutFirst: layoutFirst?.profileId ?? layoutFirst?.rawBundle?.profileId ?? null,
    profileIdMatch:
      (legacy?.profileId ?? legacy?.metadata?.extractionProfile) ===
      (layoutFirst?.profileId ?? layoutFirst?.rawBundle?.profileId),
    depositInflationLegacy: legacyInflation,
    depositInflationNew: newInflation,
    layoutFirstWins,
    promoteCandidate
  };
}

export default { comparePipelineShadow };
