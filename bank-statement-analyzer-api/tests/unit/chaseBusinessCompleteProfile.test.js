import { describe, it, expect } from 'vitest';
import {
  detect,
  extractSummary,
  extractDetailTransactions,
  extract,
  normalizeSpaces,
  pickLastReasonableAmount,
  injectChaseRowBreaks,
  parseLabeledBalance,
  mapPlumberRowsToChaseNormalized,
  findChaseDetailStartIndex,
  extractChaseSummarySlice,
  extractSummary,
  buildChaseSummaryMeta,
  extractChasePrintedFromDocument,
  parseGluedInstanceAmount,
  tryRecoverChaseFromPlumber,
  ChaseParseReconciliationError
} from '../../src/services/extraction/profiles/chaseBusinessCompleteProfile.js';
import { resolveProfile } from '../../src/services/extraction/bankProfileRegistry.js';

const CHASE_FIXTURE = normalizeSpaces(`
JPMorgan Chase Bank, N.A.
Chase Business Complete Checking
INSTANCES AMOUNT
Beginning Balance $1,000.00
Deposits and Additions 1 $200.00
Checks Paid 1 -$100.00
Ending Balance $1,100.00
Total Deposits and Additions $200.00
DEPOSITS AND ADDITIONS
DATE DESCRIPTION AMOUNT
01/15 Zelle Payment From Vendor ABC 200.00
Total Deposits and Additions $200.00
CHECKS PAID
DATE CHECK NO DESCRIPTION AMOUNT
01/16 1001 Rent Check 100.00
Total Checks Paid $100.00
`);

describe('chaseBusinessCompleteProfile', () => {
  it('detects Chase Business Complete Checking', () => {
    expect(detect(CHASE_FIXTURE)).toBeGreaterThanOrEqual(0.9);
    expect(detect('Regions Bank statement')).toBeLessThan(0.5);
  });

  it('resolveProfile prefers chase over generic_digital', () => {
    const profile = resolveProfile({ text: CHASE_FIXTURE, bankName: 'Chase' });
    expect(profile.id).toBe('chase_business_complete');
  });

  it('extractSummary parses printed totals', () => {
    const summary = extractSummary(CHASE_FIXTURE);
    expect(summary).not.toBeNull();
    expect(summary.openingBalance).toBe(1000);
    expect(summary.printedDeposits).toBe(200);
    expect(summary.closingBalance).toBe(1100);
  });

  it('pickLastReasonableAmount ignores trace digits and uses txn amount', () => {
    const amt = pickLastReasonableAmount(
      '01/15 Orig CO Name:Capri Trn: 0597656388Tc 1,104.54'
    );
    expect(amt).toBe(1104.54);
  });

  it('extractDetailTransactions collects section rows', () => {
    const rows = extractDetailTransactions(CHASE_FIXTURE, 2025);
    expect(rows.length).toBe(2);
    expect(rows.some((r) => r.amount > 0)).toBe(true);
    expect(rows.some((r) => r.amount < 0)).toBe(true);
  });

  it('extract reconciles opening + activity = closing', () => {
    const result = extract({ text: CHASE_FIXTURE, defaultYear: 2025 });
    expect(result.reconciliation.checksumOk).toBe(true);
    expect(result.transactions).toHaveLength(2);
  });

  it('throws ChaseParseReconciliationError when totals do not balance', () => {
    const bad = CHASE_FIXTURE.replace('Ending Balance $1,100.00', 'Ending Balance $9,999.00');
    expect(() => extract({ text: bad, defaultYear: 2025 })).toThrow(ChaseParseReconciliationError);
  });

  it('parseLabeledBalance handles glued negative ending balance', () => {
    const t = 'Ending Balance158-$397.76';
    expect(parseLabeledBalance('Ending\\s+Balance', t)).toBe(-397.76);
  });

  it('pickLastReasonableAmount picks txn amount on Capri trace line', () => {
    const amt = pickLastReasonableAmount(
      '02/01 022135515 Ind Name:Capri Trn: 0597656388Tc 762.06'
    );
    expect(amt).toBe(762.06);
  });

  it('findChaseDetailStartIndex finds *start*deposits marker', () => {
    const t = normalizeSpaces(`
*start*summary
*start*deposits
02/01 Zelle Payment 500.00
`);
    expect(findChaseDetailStartIndex(t)).toBeGreaterThanOrEqual(0);
    expect(t.slice(findChaseDetailStartIndex(t))).toMatch(/02\/01/);
  });

  it('mapPlumberRowsToChaseNormalized accepts ISO dates from normalized plumber rows', () => {
    const rows = mapPlumberRowsToChaseNormalized(
      [
        {
          date: '2025-02-01',
          dateRaw: '02/01',
          description: 'Zelle Payment',
          amount: 500,
          type: 'CREDIT',
          section: 'deposits'
        },
        {
          date: '2025-02-02',
          dateRaw: '02/02',
          description: 'Check paid',
          amount: 100,
          type: 'DEBIT',
          section: 'checks'
        }
      ],
      2025
    );
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.find((r) => r.sectionId === 'deposits')?.amount).toBeGreaterThan(0);
    expect(rows.find((r) => r.sectionId === 'checks')?.amount).toBeLessThan(0);
    expect(rows.every((r) => /^\d{4}-\d{2}-\d{2}$/.test(r.postedDate))).toBe(true);
  });

  it('mapPlumberRowsToChaseNormalized respects DEBIT type even when section is deposits', () => {
    const rows = mapPlumberRowsToChaseNormalized(
      [
        {
          date: '2025-02-02',
          dateRaw: '02/02',
          description: 'Mis-tagged withdrawal',
          amount: -100,
          type: 'DEBIT',
          section: 'deposits'
        },
        {
          date: '2025-02-01',
          dateRaw: '02/01',
          description: 'Zelle Payment',
          amount: 500,
          type: 'CREDIT',
          section: 'atm_debit'
        }
      ],
      2025
    );
    expect(rows.find((r) => r.description.includes('Mis-tagged'))?.amount).toBeLessThan(0);
    expect(rows.find((r) => r.description.includes('Zelle'))?.amount).toBeGreaterThan(0);
  });

  it('mapPlumberRowsToChaseNormalized signs by section and type', () => {
    const rows = mapPlumberRowsToChaseNormalized(
      [
        { date: '02/01', description: 'Deposit', amount: 100, type: 'CREDIT', section: 'deposits' },
        { date: '02/02', description: 'Check', amount: 50, type: 'DEBIT', section: 'checks' }
      ],
      2025
    );
    expect(rows).toHaveLength(2);
    expect(rows.find((r) => r.sectionId === 'deposits')?.amount).toBeGreaterThan(0);
    expect(rows.find((r) => r.sectionId === 'checks')?.amount).toBeLessThan(0);
  });

  it('extractSummary reads glued INSTANCES printed deposits', () => {
    const glued = normalizeSpaces(`
Chase Business Complete Checking INSTANCES AMOUNT
Beginning Balance $2,227.34 Deposits and Additions3050,604.44 Checks Paid30-33,212.29
Ending Balance158-$397.76
Total Deposits and Additions $50,604.44
`);
    const summary = extractSummary(glued);
    expect(summary?.printedDeposits).toBe(50604.44);
    expect(summary?.openingBalance).toBe(2227.34);
  });

  it('parseGluedInstanceAmount splits instance count from amount', () => {
    expect(parseGluedInstanceAmount('3050,604.44')).toBe(50604.44);
    expect(parseGluedInstanceAmount('3266,564.41')).toBe(66564.41);
    expect(parseGluedInstanceAmount('3352,239.94')).toBe(52239.94);
  });

  it('extractChasePrintedFromDocument prefers last Total Deposits line', () => {
    const doc = normalizeSpaces(`
INSTANCES AMOUNT Beginning Balance-$397.76 Deposits and Additions3266,564.41
DEPOSITS AND ADDITIONS DATE DESCRIPTION AMOUNT
02/01 Zelle 500.00
Total Deposits and Additions $66,564.41
CHECKS PAID
Total Checks Paid $33,212.29
`);
    const printed = extractChasePrintedFromDocument(doc);
    expect(printed?.printedDeposits).toBe(66564.41);
    expect(printed?.printedWithdrawals).toBeGreaterThanOrEqual(33212.29);
  });

  it('buildChaseSummaryMeta ignores bad stitcher override when doc has Total line', () => {
    const doc = normalizeSpaces(`
Beginning Balance $2,227.34 Deposits and Additions3266,564.41
Total Deposits and Additions $50,604.44
`);
    const meta = buildChaseSummaryMeta(doc, {
      stitcherPrinted: { totalDeposits: 266564.41, totalWithdrawals: 999999 }
    });
    expect(meta?.printedDeposits).toBe(50604.44);
  });

  it('tryRecoverChaseFromPlumber accepts plumber rows when checksum matches', () => {
    const text = `
Chase Business Complete Checking INSTANCES AMOUNT
Beginning Balance $1,000.00
Total Deposits and Additions $200.00
Total Checks Paid $100.00
Ending Balance $1,100.00
DEPOSITS AND ADDITIONS DATE DESCRIPTION AMOUNT
01/15 Vendor 200.00
CHECKS PAID DATE CHECK NO DESCRIPTION AMOUNT
01/16 1001 Rent 100.00
`;
    const recovered = tryRecoverChaseFromPlumber({
      text,
      defaultYear: 2025,
      plumberTransactions: [
        { date: '01/15', description: 'Vendor', amount: 200, type: 'CREDIT', section: 'deposits' },
        { date: '01/16', description: 'Rent', amount: 100, type: 'DEBIT', section: 'checks' }
      ]
    });
    expect(recovered?.checksumOk).toBe(true);
    expect(recovered?.transactions).toHaveLength(2);
  });

  it('extractChaseSummarySlice stops before detail section', () => {
    const t = normalizeSpaces(`
INSTANCES AMOUNT Beginning Balance $1,000.00 Deposits and Additions $200.00
*start*deposits 01/15 Row 100.00
`);
    const slice = extractChaseSummarySlice(t);
    expect(slice).toMatch(/INSTANCES/i);
    expect(slice).not.toMatch(/\*start\*deposits/);
  });

  it('extractDetailTransactions parses glued pdf-parse style rows', () => {
    const glued = normalizeSpaces(`
Chase Business Complete Checking INSTANCES AMOUNT
Beginning Balance $2,227.34 Deposits and Additions3050,604.44 Checks
DEPOSITS AND ADDITIONS DATE DESCRIPTION AMOUNT
02/01 Zelle Payment From Vendor ABC 500.00
02/02 Orig CO Name:Capri Trn: 0597656388Tc 762.06
CHECKS PAID DATE CHECK NO DESCRIPTION AMOUNT
02/03 1001 Rent Check 100.00
Total Deposits and Additions $1,262.06
`);
    const rows = extractDetailTransactions(glued, 2025);
    expect(rows.length).toBeGreaterThanOrEqual(3);
    expect(injectChaseRowBreaks(glued).split('\n').filter((l) => /^\d{1,2}\/\d{1,2}/.test(l.trim())).length).toBeGreaterThanOrEqual(3);
  });
});
