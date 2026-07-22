import { describe, it, expect } from 'vitest';
import {
  stitchStatement,
  parseTypeAPrintedTotals,
  isSummaryLedgerLine,
  classifyPageType
} from '../../src/services/statementStitcher.js';
import { PDFParserService } from '../../src/services/pdfParserService.js';
import { applyParseQualityPipeline } from '../../src/utils/statementParseQuality.js';

describe('statementStitcher', () => {
  it('parses Regions single-line SUMMARY block', () => {
    const text =
      'CHECKING December 30, 2023 through January 31, 2024 SUMMARY Beginning Balance$14,794.17 Deposits & Credits$139,160.99 + Withdrawals/Debits -$95,497.24 Ending Balance$17,238.53';
    const printed = parseTypeAPrintedTotals(text);
    expect(printed.opening).toBe(14794.17);
    expect(printed.totalDeposits).toBe(139160.99);
    expect(printed.totalWithdrawals).toBe(95497.24);
    expect(printed.closing).toBe(17238.53);
  });

  it('parses Type A printed totals from activity summary', () => {
    const text = [
      'Statement period activity summary',
      'Beginning balance on 1/1 $2,507.76',
      'Deposits/Credits 20,763.32',
      'Withdrawals/Debits - 22,831.73',
      'Ending balance on 1/31 $439.35'
    ].join('\n');
    const printed = parseTypeAPrintedTotals(text);
    expect(printed.opening).toBe(2507.76);
    expect(printed.closing).toBe(439.35);
    expect(printed.totalDeposits).toBe(20763.32);
    expect(printed.totalWithdrawals).toBe(22831.73);
  });

  it('classifies summary rollup lines', () => {
    expect(isSummaryLedgerLine('Deposits/Credits 20,763.32')).toBe(true);
    expect(isSummaryLedgerLine('12/1 ACH deposit 100.00')).toBe(false);
  });

  it('Wells fixture: Type B txns exclude summary rollups from ledger sum', async () => {
    const text = [
      'Initiate Business Checking',
      'Statement period activity summary',
      'Beginning balance on 1/1 $1,000.00',
      'Deposits/Credits 500.00',
      'Withdrawals/Debits - 200.00',
      'Ending balance on 1/31 $1,300.00',
      'Transaction history',
      '1/5  Payroll deposit ref 100  300.00',
      '1/6  POS DEBIT STORE  50.00',
      'Daily balance summary'
    ].join('\n');

    const stitcher = stitchStatement(text);
    expect(stitcher.typeA.printed.totalDeposits).toBe(500);

    const svc = new PDFParserService();
    const parser = svc.bankParsers.get('DEFAULT');
    const txns = await svc._extractTransactions(text, parser, {
      stitcher,
      sectionAnchorMode: 'transaction_history_strict'
    });
    expect(txns.length).toBe(2);

    const depSum = txns.filter((t) => Number(t.amount) > 0).reduce((s, t) => s + Number(t.amount), 0);
    expect(depSum).toBe(300);
    expect(depSum).not.toBe(500);
  });

  it('stitchStatement fills printed totals from full text when Type A pages empty', () => {
    const page1 = 'Page 1 of 6\nRegions Bank marketing';
    const page2 =
      'Page 2 of 6\nSUMMARY Beginning Balance$10,040.61 Deposits & Credits$168,130.56 + Withdrawals/Debits -$117,088.85 Ending Balance$50,256.27';
    const page3 = 'Page 3 of 6\nElectronic Deposits\n05/01 Deposit 100.00';
    const raw = [page1, page2, page3].join('\n');
    const stitcher = stitchStatement(raw);
    expect(stitcher.typeA.printed.totalDeposits).toBe(168130.56);
    expect(stitcher.typeA.printed.opening).toBe(10040.61);
  });

  it('Regions anchor mode keeps activity tables in Type B', () => {
    const text = [
      'Account summary',
      'Electronic Deposits',
      '12/1  DEPOSIT FROM PAYROLL  200.00',
      'Electronic Withdrawals',
      '12/2  POS DEBIT STORE  100.00'
    ].join('\n');
    const stitcher = stitchStatement(text);
    expect(stitcher.typeB.combinedText).toContain('Electronic Deposits');
    expect(classifyPageType(stitcher.typeB.combinedText, 1)).toBe('B');
  });
});

describe('checksum with stitcher vitals', () => {
  it('passes when Type B txns reconcile to Type A closing', () => {
    const stmt = {
      fileName: 'stitch-ok.pdf',
      accountNumber: '0241929470',
      openingBalance: 1000,
      closingBalance: 1250,
      statementPeriod: { startDate: '2025-01-01', endDate: '2025-01-31' },
      stitcher: {
        typeA: {
          printed: { opening: 1000, closing: 1250, totalDeposits: 300, totalWithdrawals: 50 }
        }
      },
      transactions: [
        { date: '2025-01-05', description: 'Deposit', amount: 300, type: 'credit', rawLine: 'dep' },
        { date: '2025-01-06', description: 'POS DEBIT', amount: -50, type: 'DEBIT', rawLine: 'POS DEBIT' }
      ],
      parseResult: { metadata: { pageCount: 1 } }
    };
    const { parseQuality } = applyParseQualityPipeline(stmt, {});
    expect(parseQuality).toBe('OK');
  });
});
