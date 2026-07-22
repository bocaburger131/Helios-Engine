import { describe, it, expect } from 'vitest';
import {
  computeUnderwritingVitals,
  buildDailyBalances,
  flagNsfAndOverdraft,
  detectMcaStacking,
  computeTrueRevenue,
  classifyOwnerDraw,
  computeOwnerDrawMetrics
} from '../../src/utils/macroAnalytics.js';

const LEDGER = [
  { date: '2025-01-01', description: 'Opening period', amount: 0, type: 'credit' },
  { date: '2025-01-05', description: 'PAYROLL DEPOSIT', amount: 5000, type: 'credit' },
  { date: '2025-01-08', description: 'ZELLE PAYMENT FROM JOHN SMITH', amount: 800, type: 'credit' },
  { date: '2025-01-12', description: 'NSF FEE', amount: -35, type: 'debit' },
  { date: '2025-01-15', description: 'ACH DEBIT ONDECK CAPITAL', amount: -350, type: 'debit' },
  { date: '2025-01-22', description: 'ACH DEBIT CAN CAPITAL', amount: -400, type: 'debit' },
  { date: '2025-02-01', description: 'PAYROLL DEPOSIT', amount: 5200, type: 'credit' },
  { date: '2025-02-03', description: 'OVERDRAFT FEE', amount: -35, type: 'debit' },
  { date: '2025-02-10', description: 'MERCHANT DEPOSIT', amount: 3100, type: 'credit' },
  { date: '2025-03-01', description: 'PAYROLL DEPOSIT', amount: 5100, type: 'credit' }
];

describe('macroAnalytics', () => {
  it('signs unsigned Chase-style debit/credit amounts in daily balances', () => {
    const chaseStyle = [
      { date: '2025-01-01', amount: 5000, type: 'credit' },
      { date: '2025-01-02', amount: 3000, type: 'debit' },
      { date: '2025-01-03', amount: 1000, type: 'credit' }
    ];
    const daily = buildDailyBalances(chaseStyle, 1000);
    const last = daily.daily[daily.daily.length - 1];
    expect(last.balance).toBe(4000);
  });

  it('computes ADB and negative day counts', () => {
    const daily = buildDailyBalances(LEDGER, 1000);
    expect(daily.periodDays).toBeGreaterThan(0);
    expect(daily.negativeDayCount).toBeGreaterThanOrEqual(0);
    const vitals = computeUnderwritingVitals({
      transactions: LEDGER,
      openingBalance: 1000,
      closingBalance: 5000,
      applicationContext: { ownerName: 'John Smith' }
    });
    expect(vitals.adb.l3mAverage).toBeGreaterThan(0);
    expect(vitals.liquidity).toHaveProperty('negativeDayCount');
  });

  it('clamps the daily-balance window and drops outlier-dated txns', () => {
    const withOutlier = [
      { date: '1970-01-01', description: 'OCR GHOST ROW', amount: -10, type: 'debit' },
      ...LEDGER
    ];
    const daily = buildDailyBalances(withOutlier, 1000);
    expect(daily.droppedOutlierTxnCount).toBe(1);
    // Window stays the real statement span, not 1970 -> 2025.
    expect(daily.periodDays).toBeLessThanOrEqual(400);
    expect(daily.periodDays).toBeGreaterThan(0);
  });

  it('reports zero dropped outliers for a normal ledger', () => {
    const daily = buildDailyBalances(LEDGER, 1000);
    expect(daily.droppedOutlierTxnCount).toBe(0);
  });

  it('flags NSF and overdraft transactions', () => {
    const nsf = flagNsfAndOverdraft(LEDGER);
    expect(nsf.nsfCount).toBeGreaterThanOrEqual(1);
    expect(nsf.overdraftCount).toBeGreaterThanOrEqual(1);
    expect(nsf.flaggedTransactions.length).toBeGreaterThanOrEqual(2);
  });

  it('detects MCA stacking with multiple lenders', () => {
    const mca = detectMcaStacking(LEDGER);
    expect(mca.detected).toBe(true);
    expect(mca.dailyOrWeeklyDebits.length).toBeGreaterThanOrEqual(2);
  });

  it('excludes owner Zelle from true revenue', () => {
    const rev = computeTrueRevenue(LEDGER, { ownerName: 'John Smith' });
    expect(rev.excludedNonRevenue.some((e) => e.exclusionReason === 'OWNER_PERSONAL_TRANSFER')).toBe(
      true
    );
    expect(rev.l3mTrueRevenueAverage).toBeGreaterThan(0);
  });

  it('returns full underwriting vitals shape', () => {
    const vitals = computeUnderwritingVitals({
      transactions: LEDGER,
      openingBalance: 1000,
      months: 3,
      applicationContext: { ownerName: 'John Smith' }
    });
    expect(vitals).toHaveProperty('forensicBriefing.summaryMarkdown');
    expect(vitals).toHaveProperty('computedAt');
    expect(Array.isArray(vitals.forensicBriefing.alerts)).toBe(true);
    expect(vitals).toHaveProperty('ownerDraw.totalDraws');
    expect(vitals).toHaveProperty('ownerDraw.drawToRevenueRatio');
  });
});

describe('owner draw classification and ratios', () => {
  const ctx = { ownerName: 'John Smith' };

  it('classifies explicit draw keywords on debits', () => {
    expect(
      classifyOwnerDraw({ description: 'OWNER DRAW CHECK 1044', amount: -2500, type: 'debit' }, ctx)
    ).toBe('OWNER_DRAW_KEYWORD');
    expect(
      classifyOwnerDraw(
        { description: 'SHAREHOLDER DISTRIBUTION Q1', amount: -4000, type: 'debit' },
        {}
      )
    ).toBe('OWNER_DRAW_KEYWORD');
  });

  it('classifies personal-channel transfers matching the owner name', () => {
    expect(
      classifyOwnerDraw(
        { description: 'ZELLE PAYMENT TO JOHN SMITH', amount: -1200, type: 'debit' },
        ctx
      )
    ).toBe('OWNER_PERSONAL_TRANSFER');
    // same channel, different payee: not a draw
    expect(
      classifyOwnerDraw(
        { description: 'ZELLE PAYMENT TO ACME SUPPLIES', amount: -1200, type: 'debit' },
        ctx
      )
    ).toBeNull();
  });

  it('never classifies inflows as draws', () => {
    expect(
      classifyOwnerDraw({ description: 'OWNER DRAW REVERSAL', amount: 500, type: 'credit' }, ctx)
    ).toBeNull();
    expect(
      classifyOwnerDraw({ description: 'ZELLE PAYMENT FROM JOHN SMITH', amount: 800, type: 'credit' }, ctx)
    ).toBeNull();
  });

  it('computes draw totals and both ratios', () => {
    const txns = [
      { date: '2025-01-05', description: 'MERCHANT DEPOSIT', amount: 10000, type: 'credit' },
      { date: '2025-01-10', description: 'OWNER DRAW', amount: -2000, type: 'debit' },
      { date: '2025-02-10', description: 'ZELLE PAYMENT TO JOHN SMITH', amount: -1000, type: 'debit' },
      { date: '2025-02-15', description: 'RENT PAYMENT', amount: -3000, type: 'debit' }
    ];
    const revenue = computeTrueRevenue(txns, ctx);
    const metrics = computeOwnerDrawMetrics(txns, ctx, revenue);

    expect(metrics.totalDraws).toBe(3000);
    expect(metrics.drawCount).toBe(2);
    expect(metrics.monthlyDraws).toEqual([
      { month: '2025-01', amount: 2000 },
      { month: '2025-02', amount: 1000 }
    ]);
    // trueTotal = 10000 -> 3000/10000
    expect(metrics.drawToRevenueRatio).toBe(0.3);
    // net cash flow = 10000 - 6000 = 4000 -> 3000/4000
    expect(metrics.drawToNetCashFlowRatio).toBe(0.75);
  });

  it('guards ratios when revenue or net cash flow are non-positive', () => {
    const txns = [
      { date: '2025-01-10', description: 'OWNER DRAW', amount: -2000, type: 'debit' },
      { date: '2025-01-15', description: 'RENT PAYMENT', amount: -3000, type: 'debit' }
    ];
    const metrics = computeOwnerDrawMetrics(txns, ctx, { trueTotal: 0 });
    expect(metrics.drawToRevenueRatio).toBeNull();
    expect(metrics.drawToNetCashFlowRatio).toBeNull();
    expect(metrics.totalDraws).toBe(2000);
  });

  it('raises a HIGH briefing alert when draws exceed 30% of true revenue', () => {
    const txns = [
      { date: '2025-01-05', description: 'MERCHANT DEPOSIT', amount: 10000, type: 'credit' },
      { date: '2025-01-10', description: 'OWNER DRAW', amount: -4000, type: 'debit' }
    ];
    const vitals = computeUnderwritingVitals({
      transactions: txns,
      openingBalance: 1000,
      applicationContext: ctx
    });
    const alert = vitals.forensicBriefing.alerts.find((a) => a.code === 'HIGH_OWNER_DRAW_RATIO');
    expect(alert).toBeDefined();
    expect(alert.severity).toBe('HIGH');
    expect(vitals.forensicBriefing.summaryMarkdown).toMatch(/Owner draws/);
  });
});
