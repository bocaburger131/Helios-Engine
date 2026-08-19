import { describe, it, expect } from 'vitest';
import {
  parseRegionsSections,
  REGIONS_SECTIONS,
  normalizeSectionLabel
} from '../../src/services/extraction/profiles/regionsSectionExtractor.js';

describe('regionsSectionExtractor glued amounts', () => {
  const year = 2025;

  it('recovers amount when reference digits glue without comma groups', () => {
    const { transactions } = parseRegionsSections(
      ['WITHDRAWALS', '12/15 ACH VENDOR REF1225125.00'].join('\n'),
      year
    );
    expect(transactions).toHaveLength(1);
    expect(transactions[0].amount).toBe(-125);
  });

  it('recovers comma-grouped amount when prior digit run is glued', () => {
    const { transactions } = parseRegionsSections(
      ['WITHDRAWALS', '12/15 ACH VENDOR 86439833,000.00'].join('\n'),
      year
    );
    expect(transactions).toHaveLength(1);
    expect(transactions[0].amount).toBe(-3000);
  });

  it('peels long digit bleed to recover plausible trailing amount', () => {
    const { transactions } = parseRegionsSections(
      ['WITHDRAWALS', '12/15 POS DEBIT 300345217705157555.99'].join('\n'),
      year
    );
    expect(transactions).toHaveLength(1);
    expect(Math.abs(transactions[0].amount)).toBeLessThanOrEqual(500_000);
    expect(Math.abs(transactions[0].amount)).toBe(555.99);
  });

  it('parses rows on WITHDRAWALS (CONTINUED) pages', () => {
    const text = [
      'WITHDRAWALS',
      '12/01 POS STORE 100.00',
      'WITHDRAWALS (CONTINUED)',
      '12/02 ACH PAYMENT 250.00'
    ].join('\n');
    const { bySection } = parseRegionsSections(text, year);
    expect(bySection[REGIONS_SECTIONS.WITHDRAWALS]).toHaveLength(2);
  });

  it('normalizeSectionLabel strips (CONTINUED) to primary section keys', () => {
    expect(normalizeSectionLabel('DEPOSITS & CREDITS (CONTINUED)')).toBe(
      REGIONS_SECTIONS.DEPOSITS
    );
    expect(normalizeSectionLabel('DEPOSITS AND CREDITS (CONTINUED)')).toBe(
      REGIONS_SECTIONS.DEPOSITS
    );
    expect(normalizeSectionLabel('WITHDRAWALS (CONTINUED)')).toBe(
      REGIONS_SECTIONS.WITHDRAWALS
    );
    expect(normalizeSectionLabel('CHECKS (CONTINUED)')).toBe(REGIONS_SECTIONS.CHECKS);
    expect(normalizeSectionLabel('FEES (CONTINUED)')).toBe(REGIONS_SECTIONS.FEES);
    expect(normalizeSectionLabel('(CONTINUED)')).toBeNull();
  });

  it('parses rows on DEPOSITS & CREDITS (CONTINUED) pages', () => {
    const text = [
      'DEPOSITS & CREDITS',
      '12/01 Merchant deposit 1,000.00',
      'DEPOSITS & CREDITS (CONTINUED)',
      '12/02 ACH CREDIT 500.00'
    ].join('\n');
    const { bySection } = parseRegionsSections(text, year);
    expect(bySection[REGIONS_SECTIONS.DEPOSITS]).toHaveLength(2);
  });

  it('parses RETURNED CHECKS as credits and FEES as debits', () => {
    const text = [
      'DEPOSITS & CREDITS',
      '06/01 Merchant deposit 100.00',
      'Total Deposits & Credits $100.00',
      'WITHDRAWALS',
      '06/02 Card purchase 50.00',
      'Total Withdrawals $50.00',
      'RETURNED CHECKS',
      '06/10 Credit-Returned Check 1,234.56',
      'Total Returned Checks $1,234.56',
      'FEES',
      '06/15 Wire Transfer Fee 25.00',
      'Total Fees $25.00',
      'CHECKS',
      'DateCheck No.Amount',
      '06/200001100.00',
      'Total Checks $100.00',
      'DAILY BALANCE SUMMARY'
    ].join('\n');
    const { bySection, transactions } = parseRegionsSections(text, year);
    expect(bySection[REGIONS_SECTIONS.RETURNED_CHECKS]).toHaveLength(1);
    expect(bySection[REGIONS_SECTIONS.RETURNED_CHECKS][0].amount).toBe(1234.56);
    expect(bySection[REGIONS_SECTIONS.FEES]).toHaveLength(1);
    expect(bySection[REGIONS_SECTIONS.FEES][0].amount).toBe(-25);
    expect(transactions.some((t) => t.section === 'returnedChecks' && t.amount > 0)).toBe(true);
  });
});
