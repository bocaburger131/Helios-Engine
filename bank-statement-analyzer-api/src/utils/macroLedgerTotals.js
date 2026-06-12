/**
 * Macro portfolio totals — prefer per-statement monthly rollups when flat txn ledger has no debits.
 */

import { logStructured } from './structuredLog.js';

/**
 * @param {object} txnTotals from calculateTotalDepositsAndWithdrawals
 * @param {Array<{ totalDeposits?: number, totalWithdrawals?: number, netChange?: number }>} monthlyStatements
 */
export function reconcileMacroFinancialTotals(txnTotals, monthlyStatements = []) {
  const base = {
    totalDeposits: Number(txnTotals?.totalDeposits) || 0,
    totalWithdrawals: Number(txnTotals?.totalWithdrawals) || 0,
    depositCount: txnTotals?.depositCount ?? 0,
    withdrawalCount: txnTotals?.withdrawalCount ?? 0
  };

  if (!Array.isArray(monthlyStatements) || monthlyStatements.length < 2) {
    return { ...base, source: 'transactions' };
  }

  const monthlyDeposits = monthlyStatements.reduce((s, m) => s + (Number(m.totalDeposits) || 0), 0);
  const monthlyWithdrawals = monthlyStatements.reduce((s, m) => s + (Number(m.totalWithdrawals) || 0), 0);

  const txnHasNoDebits = base.totalWithdrawals === 0 && base.depositCount > 0;
  const monthlyHasFlow =
    monthlyWithdrawals > 0 || Math.abs(monthlyDeposits - monthlyWithdrawals) > 1;

  if (txnHasNoDebits && monthlyHasFlow) {
    logStructured('warn', '[MACRO_LEDGER] Using monthly statement rollups (flat ledger had zero withdrawals)', {
      txnDeposits: base.totalDeposits,
      monthlyDeposits,
      monthlyWithdrawals
    });
    return {
      totalDeposits: Math.round(monthlyDeposits * 100) / 100,
      totalWithdrawals: Math.round(monthlyWithdrawals * 100) / 100,
      depositCount: base.depositCount,
      withdrawalCount: monthlyStatements.filter((m) => (Number(m.totalWithdrawals) || 0) > 0).length,
      source: 'monthlyStatements'
    };
  }

  return { ...base, source: 'transactions' };
}

export default { reconcileMacroFinancialTotals };
