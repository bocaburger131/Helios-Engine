import { describe, it, expect } from 'vitest';
import {
  mapExpenseBucket,
  rollupExpensesFromTransactions,
  mergeExpenseRollups,
  buildFinancialTotals,
  buildTamperingSummary
} from '../../src/utils/macroBatchAggregates.js';

describe('macroBatchAggregates', () => {
  it('maps LLM categories to OpEx / COGS / HighRisk buckets', () => {
    expect(mapExpenseBucket('OpEx (Operations & Rent)')).toBe('OpEx');
    expect(mapExpenseBucket('COGS (Equipment & Inventory)')).toBe('COGS');
    expect(mapExpenseBucket('High-Risk Gambling')).toBe('HighRisk');
    expect(mapExpenseBucket('Dining')).toBe('Other');
  });

  it('rolls up debit transactions only', () => {
    const rollup = rollupExpensesFromTransactions([
      { amount: -1200, category: 'OpEx (Operations & Rent)' },
      { amount: -500, category: 'COGS (Equipment & Inventory)' },
      { amount: 3000, category: 'Income' }
    ]);
    expect(rollup.buckets.OpEx).toBe(1200);
    expect(rollup.buckets.COGS).toBe(500);
    expect(rollup.buckets.Other).toBe(0);
  });

  it('merges rollups across account groups', () => {
    const a = rollupExpensesFromTransactions([{ amount: -100, category: 'OpEx (Operations & Rent)' }]);
    const b = rollupExpensesFromTransactions([{ amount: -50, category: 'COGS (Equipment & Inventory)' }]);
    const merged = { buckets: { OpEx: 0, COGS: 0, HighRisk: 0, Other: 0 }, byCategory: {} };
    mergeExpenseRollups(merged, a);
    mergeExpenseRollups(merged, b);
    expect(merged.buckets.OpEx).toBe(100);
    expect(merged.buckets.COGS).toBe(50);
  });

  it('builds financial totals from macro aggregate', () => {
    const ft = buildFinancialTotals({
      totalDeposits: 10000,
      totalWithdrawals: 4000,
      netCashFlow: 6000,
      openingBalance: 1000,
      closingBalance: 7000,
      averageDailyBalance: 2500,
      nsfCount: 2
    });
    expect(ft.totalDeposits).toBe(10000);
    expect(ft.netCashFlow).toBe(6000);
    expect(ft.nsfCount).toBe(2);
  });

  it('summarizes tampering alerts', () => {
    const summary = buildTamperingSummary([
      { code: 'CRITICAL_TAMPERING_ALERT', severity: 'CRITICAL', message: 'gap', type: 'FRAUD' },
      { code: 'LOW_AVERAGE_BALANCE', severity: 'HIGH', message: 'low' }
    ]);
    expect(summary.count).toBe(1);
    expect(summary.critical).toBe(1);
  });
});
