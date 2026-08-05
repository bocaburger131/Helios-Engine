import { describe, it, expect } from 'vitest';
import { reconcileStatement } from '../../src/services/extraction/statementReconciliation.js';
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
