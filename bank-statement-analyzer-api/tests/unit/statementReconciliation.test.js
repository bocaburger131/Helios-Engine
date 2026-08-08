import { describe, it, expect } from 'vitest';
import {
  reconcileStatement,
  validateRowRunningBalances
} from '../../src/services/extraction/statementReconciliation.js';
import { classifyChecksumFailure } from '../../src/utils/checksumFailureMatrix.js';
import { getReconciliationSpec } from '../../src/services/extraction/reconciliationSpec.js';

describe('statementReconciliation', () => {
  it('Tier B passes when parsed totals match printed and closing balances', () => {
    const meta = {
      openingBalance: 1000,
      closingBalance: 1200,
      printedDeposits: 500,
      printedWithdrawals: 300
    };
    const transactions = [
      { amount: 500, type: 'CREDIT' },
      { amount: -300, type: 'DEBIT' }
    ];
    const recon = reconcileStatement(meta, transactions);
    expect(recon.checksumOk).toBe(true);
    expect(recon.depositsMatch).toBe(true);
    expect(recon.withdrawalsMatch).toBe(true);
    expect(recon.closingMatch).toBe(true);
  });

  it('Tier B fails when parsed deposits diverge from printed', () => {
    const meta = {
      openingBalance: 1000,
      closingBalance: 1200,
      printedDeposits: 500,
      printedWithdrawals: 300
    };
    const transactions = [
      { amount: 50, type: 'CREDIT' },
      { amount: -300, type: 'DEBIT' }
    ];
    const recon = reconcileStatement(meta, transactions);
    expect(recon.checksumOk).toBe(false);
    expect(recon.depositsMatch).toBe(false);
  });

  it('never accepts on printed SUMMARY identity alone (universal gate)', () => {
    const spec = getReconciliationSpec('regions_business_checking');
    const meta = {
      openingBalance: 10040.61,
      closingBalance: 50256.27,
      printedDeposits: 168130.56,
      printedWithdrawals: 127914.9,
      printedLines: {
        deposits: 168130.56,
        withdrawals: 117088.85,
        checks: 10826.05,
        fees: 0
      },
      reconciliationSpec: spec
    };
    const recon = reconcileStatement(meta, []);
    expect(recon.printedClosingMatch).toBe(true);
    expect(recon.checksumOk).toBe(false);
    expect(recon.ledgerOk).toBe(false);

    const classified = classifyChecksumFailure(recon, []);
    expect(classified.class).toBe('FALSE_LAYOUT_PASS_RISK');
  });

  it('accepts when activity matches even if section line tags are incomplete', () => {
    const spec = getReconciliationSpec('regions_business_checking');
    const meta = {
      openingBalance: 1000,
      closingBalance: 1200,
      printedDeposits: 500,
      printedWithdrawals: 300,
      printedLines: { deposits: 500, withdrawals: 300, checks: 0, fees: 0 },
      reconciliationSpec: spec
    };
    const transactions = [
      { amount: 500, type: 'CREDIT', section: 'deposits' },
      { amount: -300, type: 'DEBIT', section: 'withdrawals' }
    ];
    const recon = reconcileStatement(meta, transactions);
    expect(recon.activityOk).toBe(true);
    expect(recon.checksumOk).toBe(true);
  });
});

describe('validateRowRunningBalances', () => {
  it('passes a clean Previous+Deposit−Withdrawal=Balance chain', () => {
    const transactions = [
      { amount: 100, type: 'CREDIT', balance: 1100, page: 1, description: 'Deposit A' },
      { amount: -40, type: 'DEBIT', balance: 1060, page: 1, description: 'Debit B' },
      { amount: 25, type: 'CREDIT', balance: 1085, page: 2, description: 'Deposit C' }
    ];
    const result = validateRowRunningBalances(transactions, { openingBalance: 1000 });
    expect(result.ok).toBe(true);
    expect(result.violations).toEqual([]);
  });

  it('fails a broken middle row with exact rowIndex and delta', () => {
    // opening 1000 → +100 = 1100 (ok) → −40 should be 1060 but printed 1050 → delta +10
    const transactions = [
      { amount: 100, type: 'CREDIT', balance: 1100, page: 1, description: 'Deposit A' },
      { amount: -40, type: 'DEBIT', balance: 1050, page: 1, description: 'Broken middle' },
      { amount: 25, type: 'CREDIT', balance: 1075, page: 2, description: 'Deposit C' }
    ];
    const result = validateRowRunningBalances(transactions, { openingBalance: 1000 });
    expect(result.ok).toBe(false);
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0]).toMatchObject({
      rowIndex: 1,
      delta: 10,
      previous: 1100,
      deposit: 0,
      withdrawal: 40,
      balance: 1050,
      page: 1,
      description: 'Broken middle'
    });
  });

  it('skips rows without usable balance', () => {
    const transactions = [
      { amount: 50, type: 'CREDIT', balance: 1050, page: 1 },
      { amount: -10, type: 'DEBIT', description: 'no bal' },
      { amount: 20, type: 'CREDIT', balance: 1060, page: 2 }
    ];
    // After skip: prev stays 1050; +20 = 1070 expected vs 1060 → delta 10
    // Wait: skip means we don't apply the -10 either; so 1050+20=1070 vs 1060.
    const result = validateRowRunningBalances(transactions, { openingBalance: 1000 });
    expect(result.ok).toBe(false);
    expect(result.violations[0].rowIndex).toBe(2);
    expect(result.violations[0].delta).toBe(10);
  });
});
