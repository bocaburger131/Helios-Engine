import { describe, it, expect } from 'vitest';
import { buildChartActivityRollup } from '../../src/utils/chartActivityRollup.js';

describe('buildChartActivityRollup', () => {
  const txns = [
    { date: '2024-12-02', amount: 100, type: 'CREDIT', description: 'Deposit' },
    { date: '2024-12-02', amount: -40, type: 'DEBIT', description: 'Payment' },
    { date: '2024-12-03', amount: 50, type: 'CREDIT', description: 'Deposit' }
  ];

  it('aggregates daily deposits and withdrawals', () => {
    const rollup = buildChartActivityRollup(txns, 1000);
    expect(rollup.version).toBe(1);
    expect(rollup.sourceTxnCount).toBe(3);
    expect(rollup.daily).toHaveLength(2);

    const dec2 = rollup.daily.find((d) => d.date === '2024-12-02');
    expect(dec2.deposits).toBe(100);
    expect(dec2.withdrawals).toBe(40);
    expect(dec2.net).toBe(60);
    expect(dec2.txnCount).toBe(2);
    expect(dec2.balance).toBe(1060);

    const dec3 = rollup.daily.find((d) => d.date === '2024-12-03');
    expect(dec3.net).toBe(50);
    expect(dec3.balance).toBe(1110);
  });

  it('builds weekly buckets from daily rows', () => {
    const rollup = buildChartActivityRollup(txns, 0);
    expect(rollup.weekly.length).toBeGreaterThan(0);
    const week = rollup.weekly[0];
    expect(week.deposits).toBe(150);
    expect(week.withdrawals).toBe(40);
    expect(week.txnCount).toBe(3);
  });

  it('returns empty daily for no transactions', () => {
    const rollup = buildChartActivityRollup([], 500);
    expect(rollup.daily).toEqual([]);
    expect(rollup.weekly).toEqual([]);
    expect(rollup.openingBalance).toBe(500);
  });

  it('includes L3M window summary', () => {
    const rollup = buildChartActivityRollup(txns, 0);
    expect(rollup.windows?.l3m).toBeTruthy();
    expect(rollup.windows.l3m.deposits).toBe(150);
    expect(rollup.windows.l3m.withdrawals).toBe(40);
    expect(rollup.windows.l3m.net).toBe(110);
  });

  it('uses calendar days for L3M averages when monthly summaries provided', () => {
    const monthlyRows = [
      {
        monthKey: '2024-12',
        totalDeposits: 150,
        totalWithdrawals: 40,
        coveragePeriod: { startDate: '2024-12-01', endDate: '2024-12-31' }
      }
    ];
    const rollup = buildChartActivityRollup(txns, 0, monthlyRows);
    expect(rollup.windows.l3m.calendarDays).toBe(31);
    expect(rollup.windows.l3m.avgDailyDeposits).toBeCloseTo(150 / 31, 2);
    expect(rollup.windows.l3m.reconciliation?.withinTolerance).toBe(true);
  });

  it('flags reconciliation mismatch when chart totals diverge from summaries', () => {
    const monthlyRows = [
      {
        monthKey: '2024-12',
        totalDeposits: 999,
        totalWithdrawals: 40,
        coveragePeriod: { startDate: '2024-12-01', endDate: '2024-12-31' }
      }
    ];
    const rollup = buildChartActivityRollup(txns, 0, monthlyRows);
    expect(rollup.windows.l3m.reconciliation?.withinTolerance).toBe(false);
    expect(rollup.windows.l3m.reconciliation?.deltaDeposits).toBe(150 - 999);
  });
});
