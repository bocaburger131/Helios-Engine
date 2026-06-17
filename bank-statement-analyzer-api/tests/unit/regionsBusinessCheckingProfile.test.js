import { describe, it, expect } from 'vitest';
import {
  detect,
  buildRegionsSummaryMeta,
  mapToLedgerTransactions
} from '../../src/services/extraction/profiles/regionsBusinessCheckingProfile.js';
import { normalizePlumberJson } from '../../src/services/extraction/plumberRowNormalizer.js';
import { reconcileStatement } from '../../src/services/extraction/statementReconciliation.js';

describe('regionsBusinessCheckingProfile', () => {
  it('detect scores Regions statements above generic threshold', () => {
    const text = [
      'Regions Bank',
      'SUMMARY',
      'Beginning balance $3,961.00',
      'Electronic Deposits',
      'Deposits & Credits $10,000.00',
      'Withdrawals / Debits $8,000.00',
      'Ending balance $5,961.00'
    ].join('\n');
    expect(detect(text)).toBeGreaterThan(0.8);
    expect(detect('Chase Business Complete Checking')).toBeLessThan(0.5);
  });

  it('buildRegionsSummaryMeta extracts printed totals', () => {
    const text = [
      'SUMMARY',
      'Beginning balance on 01/01 $1,000.00',
      'Deposits & Credits $500.00',
      'Withdrawals / Debits $200.00',
      'Ending balance on 01/31 $1,300.00'
    ].join('\n');
    const meta = buildRegionsSummaryMeta(text);
    expect(meta?.openingBalance).toBe(1000);
    expect(meta?.printedDeposits).toBe(500);
    expect(meta?.printedWithdrawals).toBe(200);
    expect(meta?.closingBalance).toBe(1300);
  });

  it('plumber rows reconcile against Regions printed totals', () => {
    const text = [
      'SUMMARY',
      'Beginning balance $1,000.00',
      'Deposits & Credits $500.00',
      'Withdrawals / Debits $200.00',
      'Ending balance $1,300.00'
    ].join('\n');
    const plumberRows = [
      { date: '01/15', description: 'Payroll deposit', amount: 500, type: 'CREDIT' },
      { date: '01/16', description: 'ACH vendor', amount: 200, type: 'DEBIT' }
    ];
    const { transactions: normalized } = normalizePlumberJson(
      { transactions: plumberRows },
      2025
    );
    expect(normalized.length).toBe(2);
    const ledger = mapToLedgerTransactions(normalized);
    expect(ledger.length).toBe(2);
    const summary = buildRegionsSummaryMeta(text);
    const reconciliation = reconcileStatement(
      {
        openingBalance: summary?.openingBalance,
        closingBalance: summary?.closingBalance,
        printedDeposits: summary?.printedDeposits,
        printedWithdrawals: summary?.printedWithdrawals
      },
      ledger
    );
    expect(reconciliation.checksumOk).toBe(true);
  });
});
