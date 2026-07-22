import { describe, it, expect } from 'vitest';
import {
  computeForensicIntelligence,
  computeCashRunwayStress,
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

describe('computeCashRunwayStress (30-day stress test)', () => {
  // dailyInflow $50, dailyBurn $100 over a 30-day window
  const window = { monthlyBreakdown: [{ deposits: 1500, withdrawals: 3000 }], daysCovered: 30 };

  it('projects runway per scenario with known burn/inflow fixtures', () => {
    const r = computeCashRunwayStress({ ...window, cashPosition: 3000 });
    expect(r.available).toBe(true);
    expect(r.dailyInflow).toBe(50);
    expect(r.dailyBurn).toBe(100);
    // current: net -$50/day -> 60 days
    expect(r.scenarios.currentBurn.runwayDays).toBe(60);
    // stressed: burn $120 -> net -$70/day -> floor(3000/70) = 42 days
    expect(r.scenarios.stressedBurn20.runwayDays).toBe(42);
    expect(r.scenarios.stressedBurn20.burnMultiplier).toBe(1.2);
    // revenue stop: -$100/day -> exactly 30 days, survives the horizon
    expect(r.scenarios.revenueStop.runwayDays).toBe(30);
    expect(r.scenarios.revenueStop.survivesHorizon).toBe(true);
    expect(r.riskBand).toBe('LOW');
  });

  it('bands CRITICAL when current-burn runway is under 15 days', () => {
    const r = computeCashRunwayStress({ ...window, cashPosition: 700 });
    expect(r.scenarios.currentBurn.runwayDays).toBe(14);
    expect(r.riskBand).toBe('CRITICAL');
  });

  it('bands HIGH at exactly 15 days of current-burn runway (fails 30-day horizon)', () => {
    const r = computeCashRunwayStress({ ...window, cashPosition: 750 });
    expect(r.scenarios.currentBurn.runwayDays).toBe(15);
    expect(r.scenarios.currentBurn.survivesHorizon).toBe(false);
    expect(r.riskBand).toBe('HIGH');
  });

  it('bands HIGH when current burn survives but +20% burn drops under 15 days', () => {
    // inflow $95/day, burn $100/day; stressed burn $120 -> net -$25/day
    const r = computeCashRunwayStress({
      monthlyBreakdown: [{ deposits: 2850, withdrawals: 3000 }],
      daysCovered: 30,
      cashPosition: 350
    });
    expect(r.scenarios.currentBurn.runwayDays).toBe(70);
    expect(r.scenarios.stressedBurn20.runwayDays).toBe(14);
    expect(r.riskBand).toBe('HIGH');
  });

  it('bands MODERATE when only the revenue-stop scenario fails the horizon', () => {
    // inflow $100/day, burn $50/day: current and stressed nets are positive
    const r = computeCashRunwayStress({
      monthlyBreakdown: [{ deposits: 3000, withdrawals: 1500 }],
      daysCovered: 30,
      cashPosition: 1000
    });
    expect(r.scenarios.currentBurn.runwayDays).toBeNull();
    expect(r.scenarios.currentBurn.survivesHorizon).toBe(true);
    expect(r.scenarios.stressedBurn20.survivesHorizon).toBe(true);
    expect(r.scenarios.revenueStop.runwayDays).toBe(20);
    expect(r.riskBand).toBe('MODERATE');
  });

  it('is CRITICAL with zero runway when cash is already non-positive', () => {
    const r = computeCashRunwayStress({ ...window, cashPosition: -50 });
    expect(r.scenarios.revenueStop.runwayDays).toBe(0);
    expect(r.riskBand).toBe('CRITICAL');
  });

  it('reports unavailable without a cash position or without observed burn', () => {
    const noCash = computeCashRunwayStress({ ...window, cashPosition: null });
    expect(noCash.available).toBe(false);
    expect(noCash.reason).toBe('NO_CASH_POSITION');

    const noBurn = computeCashRunwayStress({
      monthlyBreakdown: [{ deposits: 3000, withdrawals: 0 }],
      daysCovered: 30,
      cashPosition: 1000
    });
    expect(noBurn.available).toBe(false);
    expect(noBurn.reason).toBe('NO_BURN_OBSERVED');
  });

  it('falls back to financialSummary totals when the window has no withdrawals', () => {
    const r = computeCashRunwayStress({
      monthlyBreakdown: [],
      daysCovered: 30,
      cashPosition: 3000,
      fallbackDeposits: 1500,
      fallbackWithdrawals: 3000
    });
    expect(r.available).toBe(true);
    expect(r.dailyBurn).toBe(100);
    expect(r.scenarios.currentBurn.runwayDays).toBe(60);
  });

  it('uses the fallback PAIR when the window saw deposits but no burn', () => {
    // Deposits-only window must not mask fallback withdrawals as NO_BURN_OBSERVED,
    // and sources must not be mixed (window deposits + fallback withdrawals).
    const r = computeCashRunwayStress({
      monthlyBreakdown: [{ deposits: 9999, withdrawals: 0 }],
      daysCovered: 30,
      cashPosition: 3000,
      fallbackDeposits: 1500,
      fallbackWithdrawals: 3000
    });
    expect(r.available).toBe(true);
    expect(r.dailyInflow).toBe(50); // from fallback pair, not the 9999 window
    expect(r.dailyBurn).toBe(100);
    expect(r.scenarios.currentBurn.runwayDays).toBe(60);
  });

  it('flags a razor-thin positive net as fragile and bands at least MODERATE', () => {
    // inflow $100.50/day vs burn $100/day: +$0.50 net < 5% of burn
    const r = computeCashRunwayStress({
      monthlyBreakdown: [{ deposits: 3015, withdrawals: 3000 }],
      daysCovered: 30,
      cashPosition: 100000
    });
    expect(r.scenarios.currentBurn.runwayDays).toBeNull();
    expect(r.scenarios.currentBurn.fragilePositive).toBe(true);
    expect(r.riskBand).toBe('MODERATE');
  });

  it('does not flag a comfortable surplus as fragile', () => {
    // inflow $200/day vs burn $100/day, huge cash so stressed/revenue-stop survive
    const r = computeCashRunwayStress({
      monthlyBreakdown: [{ deposits: 6000, withdrawals: 3000 }],
      daysCovered: 30,
      cashPosition: 100000
    });
    expect(r.scenarios.currentBurn.fragilePositive).toBe(false);
    expect(r.riskBand).toBe('LOW');
  });
});

describe('cashRunwayStress cash-position preference in computeForensicIntelligence', () => {
  const base = {
    transactions: [],
    balanceAnalysis: { averageDailyBalance: 2000 },
    requestedLoanAmount: 0,
    daysCovered: 90,
    months: 3
  };

  it('prefers closingBalance when present', () => {
    const result = computeForensicIntelligence({
      ...base,
      financialSummary: {
        totalDeposits: 9000,
        totalWithdrawals: 9000,
        openingBalance: 100,
        netChange: 200,
        closingBalance: 5000
      }
    });
    expect(result.cashRunwayStress.cashPosition).toBe(5000);
  });

  it('falls back to opening + netChange when closing is absent', () => {
    const result = computeForensicIntelligence({
      ...base,
      financialSummary: {
        totalDeposits: 9000,
        totalWithdrawals: 9000,
        openingBalance: 1000,
        netChange: 500
      }
    });
    expect(result.cashRunwayStress.cashPosition).toBe(1500);
  });

  it('falls back to ADB when neither closing nor opening/netChange are usable', () => {
    const result = computeForensicIntelligence({
      ...base,
      financialSummary: { totalDeposits: 9000, totalWithdrawals: 9000 }
    });
    expect(result.cashRunwayStress.cashPosition).toBe(2000);
  });
});
