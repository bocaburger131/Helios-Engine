import { describe, it, expect } from 'vitest';
import {
  computeUnderwritingVitals,
  buildDailyBalances,
  flagNsfAndOverdraft,
  detectMcaStacking,
  computeTrueRevenue
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
  });
});
