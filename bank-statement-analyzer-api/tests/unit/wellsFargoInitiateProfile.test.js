import { describe, it, expect } from 'vitest';
import {
  detect,
  extractSummary,
  extractTransactionSection,
  pickWellsExtractionText,
  splitRows,
  parseRow,
  resolvePostedYear,
  extract,
  normalizeSpaces,
  isDateGroupRowStart,
  classifyWellsDescription,
  assignEndingDailyBalancesByDateBlock,
  stripWellsAmountTokens,
  tryRecoverWellsNearMiss,
  WellsParseReconciliationError
} from '../../src/services/extraction/profiles/wellsFargoInitiateProfile.js';
import { reconcileStatement } from '../../src/services/extraction/statementReconciliation.js';

const JAN_SUMMARY_SNIPPET = `
Statement period activity summary Beginning balance on 1/1 $2,507.76 Deposits/Credits 20,763.32 Withdrawals/Debits - 22,831.73 Ending balance on 1/31 $439.35 Account number: 5195725428
Transaction history
1/2 Instant Pmt From Square on 01/01 Ref#20250101021000021P1Brjpc02640103421 96.28 2,604.04
1/3 Purchase authorized on 01/02 123.45 2,480.59
Totals 20,763.32 22,831.73
`;

describe('wellsFargoInitiateProfile', () => {
  it('detects Initiate Business Checking text', () => {
    const text = 'Initiate Business Checking SM January 31, 2025 Transaction history';
    expect(detect(text)).toBeGreaterThanOrEqual(0.9);
    expect(detect('Regions Bank statement')).toBeLessThan(0.5);
  });

  it('extractSummary parses printed totals', () => {
    const summary = extractSummary(normalizeSpaces(JAN_SUMMARY_SNIPPET));
    expect(summary).not.toBeNull();
    expect(summary.openingBalance).toBe(2507.76);
    expect(summary.printedDeposits).toBe(20763.32);
    expect(summary.printedWithdrawals).toBe(22831.73);
    expect(summary.closingBalance).toBe(439.35);
  });

  it('extractTransactionSection slices history to Totals', () => {
    const section = extractTransactionSection(normalizeSpaces(JAN_SUMMARY_SNIPPET));
    expect(section).toContain('1/2 Instant Pmt');
    expect(section).not.toMatch(/Totals\s+20,763/i);
  });

  it('extractTransactionSection ends at Totals without inline amounts', () => {
    const text = normalizeSpaces(`
      Transaction history
      1/2 Foo 10.00 100.00
      Totals
      Daily balance summary
    `);
    const section = extractTransactionSection(text);
    expect(section).toContain('1/2 Foo');
    expect(section).not.toMatch(/Daily balance/i);
  });

  it('pickWellsExtractionText prefers Type B body when full text lacks history', () => {
    const typeB =
      'Transaction history\n1/2 Pay 5.00 105.00\nTotals 5.00 0.00\nDaily balance summary';
    const picked = pickWellsExtractionText('Page 1 marketing only', typeB);
    expect(picked).toContain('Transaction history');
  });

  describe('isDateGroupRowStart', () => {
    it('rejects money-only lines', () => {
      expect(isDateGroupRowStart('96.28 2,604.04')).toBe(false);
    });

    it('accepts date-prefixed transaction lines', () => {
      expect(isDateGroupRowStart('1/2 Instant Pmt From Square 96.28')).toBe(true);
    });

    it('accepts date with check number', () => {
      expect(isDateGroupRowStart('1/5 1234 Check 50.00')).toBe(true);
    });

    it('rejects header lines', () => {
      expect(isDateGroupRowStart('Date Check Number Description')).toBe(false);
    });
  });

  describe('classifyWellsDescription', () => {
    it('Transfer From → credit', () => {
      expect(classifyWellsDescription('Online Transfer From Acct').direction).toBe('credit');
    });

    it('Transfer to → debit', () => {
      expect(classifyWellsDescription('Online Transfer to Acct').direction).toBe('debit');
    });

    it('Recurring Payment Reversal → credit', () => {
      expect(classifyWellsDescription('Recurring Payment Reversal Netflix').direction).toBe(
        'credit'
      );
    });

    it('ATM Withdrawal → debit', () => {
      expect(classifyWellsDescription('ATM Withdrawal 01/02').direction).toBe('debit');
    });

    it('Purchase Return → credit', () => {
      expect(classifyWellsDescription('Purchase Return Amazon').direction).toBe('credit');
    });
  });

  it('assignEndingDailyBalancesByDateBlock puts balance only on last row per date', () => {
    const rows = [
      parseRow('1/2 Instant Pmt From Square 96.28 2,604.04', 2025),
      parseRow('1/2 Purchase authorized on 01/02 50.00 2,554.04', 2025),
      parseRow('1/3 Purchase authorized on 01/02 123.45 2,480.59', 2025)
    ].filter(Boolean);
    assignEndingDailyBalancesByDateBlock(rows);
    expect(rows[0].endingDailyBalance).toBeNull();
    expect(rows[1].endingDailyBalance).toBe(2554.04);
    expect(rows[2].endingDailyBalance).toBe(2480.59);
  });

  it('parseRow assigns credit from classifier for single amount', () => {
    const row =
      '1/2 Instant Pmt From Square on 01/01 Ref#20250101021000021P1Brjpc02640103421 96.28 2,604.04';
    const parsed = parseRow(row, 2025);
    expect(parsed.credit).toBe(96.28);
    expect(parsed.endingDailyBalance).toBe(2604.04);
    expect(parsed.amount).toBe(96.28);
    const [withBal] = assignEndingDailyBalancesByDateBlock([parsed]);
    expect(withBal.endingDailyBalance).toBe(2604.04);
  });

  it('extract + reconcile passes when ledger matches printed totals', () => {
    const mini = normalizeSpaces(`
      Initiate Business Checking
      Beginning balance on 1/1 $100.00 Deposits/Credits 50.00 Withdrawals/Debits - 30.00 Ending balance on 1/31 $120.00
      Transaction history
      1/2 Payment from client 50.00 150.00
      1/3 Purchase authorized on 01/02 30.00 120.00
      Totals 50.00 30.00
    `);
    const { meta, transactions, reconciliation, accepted } = extract({
      text: mini,
      defaultYear: 2025
    });
    expect(transactions.length).toBe(2);
    expect(reconciliation.checksumOk).toBe(true);
    expect(accepted).toBe(true);
    expect(reconcileStatement(meta, transactions).checksumOk).toBe(true);
  });

  it('extractTransactionSection does not truncate at bare Totals on continued pages', () => {
    const text = normalizeSpaces(`
      Transaction history
      1/2 Payment from client 50.00 150.00
      Transaction history (continued)
      Totals
      1/3 Purchase authorized on 01/02 30.00 120.00
      Totals 80.00 30.00
    `);
    const section = extractTransactionSection(text);
    expect(section).toContain('1/3 Purchase');
  });

  it('parseRow uses column position for unknown merchant deposits', () => {
    const row =
      '1/5 SOME MERCHANT SETTLEMENT BATCH 842.15 3,200.00';
    const parsed = parseRow(row, 2025);
    expect(parsed.credit).toBe(842.15);
    expect(parsed.amount).toBe(842.15);
  });

  it('parseRow ignores trailing balance when deposit and withdrawal columns present', () => {
    const row = '1/4 Online Transfer to Savings 100.00 50.00 2,450.00';
    const parsed = parseRow(row, 2025);
    expect(parsed.debit).toBe(50);
    expect(parsed.credit).toBeNull();
    expect(parsed.amount).toBe(-50);
  });

  it('resolvePostedYear rolls Jan rows forward on Dec-ending statements', () => {
    expect(resolvePostedYear('1/15', '12/1', '12/31', 2024)).toBe(2025);
    expect(resolvePostedYear('12/20', '12/1', '12/31', 2024)).toBe(2024);
  });

  it('extract throws WellsParseReconciliationError when totals do not match', () => {
    const bad = normalizeSpaces(`
      Initiate Business Checking
      Beginning balance on 1/1 $100.00 Deposits/Credits 50.00 Withdrawals/Debits - 30.00 Ending balance on 1/31 $120.00
      Transaction history
      1/2 Payment from client 99.00 199.00
      Totals 50.00 30.00
    `);
    expect(() => extract({ text: bad, defaultYear: 2025 })).toThrow(WellsParseReconciliationError);
  });

  it('splitRows groups continuation lines under date', () => {
    const section = '1/5 Line one 10.00\ncontinued text\n1/6 Next 20.00';
    const rows = splitRows(section);
    expect(rows.length).toBe(2);
    expect(rows[0]).toContain('continued text');
  });

  it('stripWellsAmountTokens removes trailing ending daily balance column', () => {
    const nums = [
      { value: 96.28, index: 50 },
      { value: 2604.04, index: 58 }
    ];
    const { amountTokens, endingDailyBalance } = stripWellsAmountTokens(nums);
    expect(amountTokens).toHaveLength(1);
    expect(amountTokens[0].value).toBe(96.28);
    expect(endingDailyBalance).toBe(2604.04);
  });

  it('parseRow strips two-token rows to single txn amount (balance column)', () => {
    const row = '1/10 Merchant deposit 842.15 3,200.00';
    const parsed = parseRow(row, 2025);
    expect(parsed.credit).toBe(842.15);
    expect(parsed.debit).toBeNull();
    expect(parsed.endingDailyBalance).toBe(3200);
  });

  it('parseRow handles glued trailing balance regex', () => {
    const row = '1/8 1234 Online Transfer to Savings 100.00 50.00 2,450.00';
    const parsed = parseRow(row, 2025);
    expect(parsed.debit).toBe(50);
    expect(parsed.endingDailyBalance).toBe(2450);
  });

  it('tryRecoverWellsNearMiss accepts profile when drift beats legacy path', () => {
    const reconciliation = {
      checksumOk: false,
      parsedDeposits: 21030.16,
      printedDeposits: 20763.32,
      parsedWithdrawals: 22997.96,
      printedWithdrawals: 22831.73,
      computedClosing: 539.96,
      closing: 439.35
    };
    const transactions = [{ date: '2025-01-02', amount: 96.28, description: 'test' }];
    const recovered = tryRecoverWellsNearMiss({ reconciliation, meta: {}, transactions });
    expect(recovered).not.toBeNull();
    expect(recovered.beatsLegacy).toBe(true);
    expect(recovered.transactions).toHaveLength(1);
  });

  it('WellsParseReconciliationError carries partial extract payload', () => {
    const bad = normalizeSpaces(`
      Initiate Business Checking
      Beginning balance on 1/1 $100.00 Deposits/Credits 50.00 Withdrawals/Debits - 30.00 Ending balance on 1/31 $120.00
      Transaction history
      1/2 Payment from client 99.00 199.00
      Totals 50.00 30.00
    `);
    try {
      extract({ text: bad, defaultYear: 2025 });
      expect.fail('expected throw');
    } catch (err) {
      expect(err).toBeInstanceOf(WellsParseReconciliationError);
      expect(err.partial?.transactions?.length).toBeGreaterThan(0);
      expect(err.reconciliation.checksumOk).toBe(false);
    }
  });
});
