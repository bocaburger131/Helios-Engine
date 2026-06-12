import { describe, it, expect } from 'vitest';
import { reconcileStatement } from '../../src/services/extraction/statementReconciliation.js';

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
});
