import { describe, it, expect } from 'vitest';
import { reconcileMacroFinancialTotals } from '../../src/utils/macroLedgerTotals.js';

describe('macroLedgerTotals', () => {
  it('uses monthly rollups when flat ledger has zero withdrawals', () => {
    const result = reconcileMacroFinancialTotals(
      { totalDeposits: 500000, totalWithdrawals: 0, depositCount: 100 },
      [
        { totalDeposits: 10000, totalWithdrawals: 8000 },
        { totalDeposits: 12000, totalWithdrawals: 9000 }
      ]
    );
    expect(result.source).toBe('monthlyStatements');
    expect(result.totalWithdrawals).toBe(17000);
  });

  it('keeps transaction totals when withdrawals present', () => {
    const result = reconcileMacroFinancialTotals(
      { totalDeposits: 10000, totalWithdrawals: 5000, depositCount: 10, withdrawalCount: 5 },
      [{ totalDeposits: 1000, totalWithdrawals: 500 }]
    );
    expect(result.source).toBe('transactions');
    expect(result.totalWithdrawals).toBe(5000);
  });
});
