import { describe, it, expect } from 'vitest';
import {
  PDFParserService,
  isTransactionSectionHeader
} from '../../src/services/pdfParserService.js';
import { applyParseQualityPipeline } from '../../src/utils/statementParseQuality.js';
import { probeChecksumDeltaInText } from '../../src/utils/checksumDeltaProbe.js';

describe('isTransactionSectionHeader', () => {
  it('recognizes Regions subsection headers', () => {
    expect(isTransactionSectionHeader('Electronic Deposits')).toBe(true);
    expect(isTransactionSectionHeader('CHECKS CLEARED')).toBe(true);
    expect(isTransactionSectionHeader('Bank Fees')).toBe(true);
  });
});

describe('Regions multi-table extraction', () => {
  it('parses transactions from all subsection tables', async () => {
    const svc = new PDFParserService();
    const text = [
      'Account summary',
      'Electronic Deposits',
      '12/1  Payroll deposit ref 100  500.00',
      'Total deposits',
      'Electronic Withdrawals',
      '12/2  ACH payment vendor  100.00',
      'Total withdrawals',
      'Checks Cleared',
      '12/3  Check 1234 paid  50.00',
      'Total checks'
    ].join('\n');

    const parser = svc.bankParsers.get('DEFAULT');
    const txns = await svc._extractTransactions(text, parser, {});
    expect(txns.length).toBeGreaterThanOrEqual(3);

    const descs = txns.map((t) => String(t.description).toLowerCase());
    expect(descs.some((d) => d.includes('payroll') || d.includes('deposit'))).toBe(true);
    expect(descs.some((d) => d.includes('ach') || d.includes('payment'))).toBe(true);
    expect(descs.some((d) => d.includes('check'))).toBe(true);
  });

  it('does not stop parsing after first subsection total', async () => {
    const svc = new PDFParserService();
    const text = [
      'Electronic Deposits',
      '12/1  DEPOSIT FROM PAYROLL  200.00',
      'Total deposits',
      'Electronic Withdrawals',
      '12/2  POS DEBIT STORE  100.00',
      'Total withdrawals'
    ].join('\n');
    const parser = svc.bankParsers.get('DEFAULT');
    const txns = await svc._extractTransactions(text, parser, {});
    expect(txns.length).toBe(2);
  });
});

describe('strict transaction-history section gate', () => {
  it('does not parse dated amounts before Transaction history', async () => {
    const svc = new PDFParserService();
    const text = [
      'Initiate Business Checking',
      'Account summary',
      '12/15  Beginning balance  1,000.00',
      '12/20  Marketing promo credit  500.00',
      'Total deposits  500.00',
      'Transaction history',
      '12/1  ACH deposit payroll  200.00',
      '12/2  POS debit store  50.00',
      'Daily balance summary',
      '12/31  Ending balance  1,150.00'
    ].join('\n');

    const parser = svc.bankParsers.get('DEFAULT');
    const txns = await svc._extractTransactions(text, parser, {
      sectionAnchorMode: 'transaction_history_strict'
    });
    expect(txns.length).toBe(2);
    const descs = txns.map((t) => String(t.description).toLowerCase());
    expect(descs.some((d) => d.includes('marketing'))).toBe(false);
    expect(descs.some((d) => d.includes('payroll') || d.includes('ach'))).toBe(true);
  });
});

describe('checksumDeltaProbe', () => {
  it('finds delta amount in raw text with context', () => {
    const raw = 'Summary line missing from parse Total fees 2,114.11 end of section';
    const probe = probeChecksumDeltaInText(raw, 2114.11);
    expect(probe.probeMiss).toBe(false);
    expect(probe.matches.length).toBeGreaterThan(0);
    expect(probe.matches[0].context.toLowerCase()).toContain('2,114.11');
  });
});
