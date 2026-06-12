import { describe, it, expect } from 'vitest';
import {
  computeForensicIntelligence,
  isLikelyInternalTransfer
} from '../../src/utils/forensicIntelligence.js';

const makeTxn = (date, amount) => ({ date, amount });

describe('computeForensicIntelligence', () => {
  it('happy path: 3 months of txns with requested loan returns finite metrics', () => {
    const transactions = [
      // Month 1 (Jan 2025)
      makeTxn('2025-01-05', 4000),
      makeTxn('2025-01-15', 3000),
      makeTxn('2025-01-20', -1500),
      makeTxn('2025-01-28', -800),
      // Month 2 (Feb 2025)
      makeTxn('2025-02-03', 4500),
      makeTxn('2025-02-12', 2500),
      makeTxn('2025-02-22', -1200),
      makeTxn('2025-02-26', -700),
      // Month 3 (Mar 2025)
      makeTxn('2025-03-04', 5000),
      makeTxn('2025-03-14', 3500),
      makeTxn('2025-03-21', -1800),
      makeTxn('2025-03-29', -900),
    ];

    const result = computeForensicIntelligence({
      transactions,
      financialSummary: { totalDeposits: 22500, totalWithdrawals: 6900, openingBalance: 1000 },
      balanceAnalysis: { averageDailyBalance: 5000 },
      requestedLoanAmount: 50000,
      daysCovered: 90,
      months: 3,
    });

    expect(Number.isFinite(result.prospectiveDSCR)).toBe(true);
    expect(Number.isFinite(result.daysCashOnHand)).toBe(true);
    expect(Array.isArray(result.momentum.momGrowthRates)).toBe(true);
    expect(result.momentum.momGrowthRates).toHaveLength(3);
    expect(Number.isFinite(result.liquidityFloor.gapPercentage)).toBe(true);
    expect(result.window.monthlyBreakdown).toHaveLength(3);
  });

  it('returns null prospectiveDSCR when requestedLoanAmount is 0', () => {
    const result = computeForensicIntelligence({
      transactions: [makeTxn('2025-03-15', 1000)],
      financialSummary: { totalDeposits: 1000, totalWithdrawals: 0, openingBalance: 0 },
      balanceAnalysis: { averageDailyBalance: 0 },
      requestedLoanAmount: 0,
    });

    expect(result.prospectiveDSCR).toBeNull();
  });

  it('returns null daysCashOnHand when there are no withdrawals', () => {
    const transactions = [
      makeTxn('2025-01-10', 1000),
      makeTxn('2025-02-10', 1500),
      makeTxn('2025-03-10', 2000),
    ];

    const result = computeForensicIntelligence({
      transactions,
      financialSummary: { totalDeposits: 4500, totalWithdrawals: 0, openingBalance: 500 },
      balanceAnalysis: { averageDailyBalance: 5000 },
      requestedLoanAmount: 25000,
    });

    expect(result.daysCashOnHand).toBeNull();
  });

  it('falls back to synthetic breakdown when transactions are empty', () => {
    const result = computeForensicIntelligence({
      transactions: [],
      financialSummary: { totalDeposits: 30000, totalWithdrawals: 0, openingBalance: 0 },
      balanceAnalysis: { averageDailyBalance: 0 },
      requestedLoanAmount: 0,
      months: 3,
    });

    expect(result.window.monthlyBreakdown).toHaveLength(3);
    expect(result.window.monthlyBreakdown.every(m => m.deposits === 10000)).toBe(true);
    expect(result.depositConsistencyScore).toBe(100);
    expect(result.momentum.overallTrend).toBe('STABLE');
  });

  it('returns the expected top-level shape', () => {
    const result = computeForensicIntelligence({
      transactions: [makeTxn('2025-01-10', 1000), makeTxn('2025-02-10', 1100), makeTxn('2025-03-10', 1200)],
      financialSummary: { totalDeposits: 3300, totalWithdrawals: 0, openingBalance: 100 },
      balanceAnalysis: { averageDailyBalance: 1500 },
      requestedLoanAmount: 10000,
    });

    expect(result).toHaveProperty('prospectiveDSCR');
    expect(result).toHaveProperty('daysCashOnHand');
    expect(result).toHaveProperty('depositConsistencyScore');
    expect(result).toHaveProperty('momentum.overallTrend');
    expect(result).toHaveProperty('momentum.momGrowthRates');
    expect(result).toHaveProperty('liquidityFloor.gapPercentage');
    expect(result).toHaveProperty('liquidityFloor.isHighRisk');
    expect(result).toHaveProperty('window.monthlyBreakdown');
    expect(result).toHaveProperty('computedAt');
  });

  it('flags high-risk liquidity floor when opening << ADB', () => {
    const result = computeForensicIntelligence({
      transactions: [],
      financialSummary: { totalDeposits: 0, totalWithdrawals: 0, openingBalance: 100 },
      balanceAnalysis: { averageDailyBalance: 10000 },
      requestedLoanAmount: 0,
    });

    expect(result.liquidityFloor.gapPercentage).toBe(99);
    expect(result.liquidityFloor.isHighRisk).toBe(true);
  });

  it('detects deposit velocity decline and stability risk from deposit counts', () => {
    const jan = Array.from({ length: 11 }, (_, i) =>
      makeTxn(`2025-01-${String(6 + i).padStart(2, '0')}T15:00:00.000Z`, 50)
    );
    const feb = [
      makeTxn('2025-02-05T15:00:00.000Z', 80),
      makeTxn('2025-02-20T15:00:00.000Z', 90)
    ];
    const mar = [
      makeTxn('2025-03-10T15:00:00.000Z', 100),
      makeTxn('2025-03-25T15:00:00.000Z', 110)
    ];
    const transactions = [...jan, ...feb, ...mar];

    const result = computeForensicIntelligence({
      transactions,
      financialSummary: { totalDeposits: 1000, totalWithdrawals: 0, openingBalance: 0 },
      balanceAnalysis: { averageDailyBalance: 500 },
      requestedLoanAmount: 0,
      months: 3
    });

    expect(result.depositVelocityTrend).toBe('DECLINING');
    expect(result.depositVelocityMetrics.firstMonthDepositCount).toBe(11);
    expect(result.depositVelocityMetrics.lastMonthDepositCount).toBe(2);
    expect(result.stabilityRiskAlert).toBe(true);
    expect(result.stabilityRiskReason).toMatch(/frequency/i);
  });

  it('excludes likely internal transfers from deposit buckets when hints allow', () => {
    const hints = { linkedAccountLast4s: ['****1234', '****5678'] };
    const internal = {
      date: '2025-02-15T15:00:00.000Z',
      amount: 5000,
      description: 'INTERNAL TRANSFER 1234 TO ACCT 5678'
    };
    const normal = { date: '2025-02-16T15:00:00.000Z', amount: 2000, description: 'ACH DEPOSIT ACME' };
    expect(isLikelyInternalTransfer(internal, hints)).toBe(true);
    expect(isLikelyInternalTransfer(normal, hints)).toBe(false);

    const result = computeForensicIntelligence({
      transactions: [internal, normal],
      financialSummary: { totalDeposits: 7000, totalWithdrawals: 0, openingBalance: 0 },
      balanceAnalysis: { averageDailyBalance: 1000 },
      requestedLoanAmount: 0,
      months: 3,
      transferFilterHints: hints
    });

    expect(result.internalTransferExclusion.excludedDepositCount).toBe(1);
    expect(result.internalTransferExclusion.excludedAmount).toBe(5000);
  });
});
