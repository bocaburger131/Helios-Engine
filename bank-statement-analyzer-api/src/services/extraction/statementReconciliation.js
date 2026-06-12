/**
 * Universal reconciliation against printed monthly totals (all bank profiles).
 */
import { validateReconciliation } from '../templateGraduationService.js';
import riskAnalysisService from '../riskAnalysisService.js';

const TOLERANCE = 0.01;

/**
 * @param {object} meta
 * @param {Array<object>} transactions — ledger-shaped (signed amount)
 * @returns {object}
 */
export function reconcileStatement(meta, transactions) {
  const txs = Array.isArray(transactions) ? transactions : [];
  const opening = Number(meta?.openingBalance ?? 0);
  const closing = Number(meta?.closingBalance ?? 0);
  const printedDeposits = meta?.printedDeposits;
  const printedWithdrawals = meta?.printedWithdrawals;

  const { totalDeposits, totalWithdrawals } =
    riskAnalysisService.calculateTotalDepositsAndWithdrawals(txs);

  const parsedDeposits = Number(totalDeposits.toFixed(2));
  const parsedWithdrawals = Number(totalWithdrawals.toFixed(2));

  const checksumRecon = validateReconciliation({
    transactions: txs,
    openingBalance: opening,
    closingBalance: closing,
    balances: { opening, closing }
  });

  const computedClosing = Number((opening + parsedDeposits - parsedWithdrawals).toFixed(2));

  let depositsMatch = true;
  let withdrawalsMatch = true;
  if (printedDeposits != null && Number.isFinite(Number(printedDeposits))) {
    depositsMatch = Math.abs(parsedDeposits - Number(printedDeposits)) <= TOLERANCE;
  }
  if (printedWithdrawals != null && Number.isFinite(Number(printedWithdrawals))) {
    withdrawalsMatch = Math.abs(parsedWithdrawals - Number(printedWithdrawals)) <= TOLERANCE;
  }

  const closingMatch = Math.abs(computedClosing - closing) <= TOLERANCE;

  const checksumOk =
    Boolean(checksumRecon.ok) &&
    depositsMatch &&
    withdrawalsMatch &&
    closingMatch;

  return {
    checksumOk,
    parsedDeposits,
    parsedWithdrawals,
    computedClosing,
    depositsMatch,
    withdrawalsMatch,
    closingMatch,
    checksumRecon,
    opening,
    closing,
    printedDeposits: printedDeposits != null ? Number(printedDeposits) : null,
    printedWithdrawals: printedWithdrawals != null ? Number(printedWithdrawals) : null
  };
}

/**
 * @param {Array<object>} normalizedTxns — with postedDate, endingDailyBalance
 * @returns {{ valid: boolean, violations: number }}
 */
export function validateEndingDailyBalancePlacement(normalizedTxns) {
  const byDate = new Map();
  for (const t of normalizedTxns || []) {
    const d = t.postedDate || t.date;
    if (!d) continue;
    if (!byDate.has(d)) byDate.set(d, []);
    byDate.get(d).push(t);
  }
  let violations = 0;
  for (const rows of byDate.values()) {
    const withBal = rows.filter((r) => r.endingDailyBalance != null);
    if (withBal.length === 0) continue;
    const last = rows[rows.length - 1];
    for (const r of rows) {
      if (r.endingDailyBalance != null && r !== last) violations += 1;
    }
  }
  return { valid: violations === 0, violations };
}

export default { reconcileStatement, validateEndingDailyBalancePlacement };
