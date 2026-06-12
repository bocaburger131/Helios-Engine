import { describe, it, expect } from 'vitest';
import {
  normalizeTransactionForLedger,
  normalizeTransactionsForLedger,
  normalizeLedgerType,
  applyBalanceSequenceSigns,
  normalizeTransactionsWithBalanceInference
} from '../../src/utils/transactionNormalization.js';
import riskAnalysisService from '../../src/services/riskAnalysisService.js';

describe('transactionNormalization', () => {
  it('flips positive amount when type is DEBIT', () => {
    const tx = normalizeTransactionForLedger({ amount: 50, type: 'debit', description: 'POS' });
    expect(tx.amount).toBe(-50);
    expect(tx.type).toBe('DEBIT');
  });

  it('keeps negative DEBIT', () => {
    const tx = normalizeTransactionForLedger({ amount: -25, type: 'DEBIT' });
    expect(tx.amount).toBe(-25);
  });

  it('maps deposit label to signed credit', () => {
    expect(normalizeLedgerType('deposit')).toBe('CREDIT');
    expect(normalizeLedgerType('WITHDRAWAL')).toBe('DEBIT');
  });

  it('feeds withdrawals in risk service when DEBIT was positive-only', () => {
    const totals = riskAnalysisService.calculateTotalDepositsAndWithdrawals([
      { amount: 1000, type: 'CREDIT', description: 'Pay' },
      { amount: 40, type: 'debit', description: 'Fee' }
    ]);
    expect(totals.totalDeposits).toBe(1000);
    expect(totals.totalWithdrawals).toBe(40);
    expect(totals.depositCount).toBe(1);
    expect(totals.withdrawalCount).toBe(1);
  });
});

describe('applyBalanceSequenceSigns', () => {
  it('flags positive amount as debit when balance drops by that amount', () => {
    const txs = applyBalanceSequenceSigns([
      { date: '2024-01-01', amount: 0, balance: 5000, lineNumber: 1 },
      { date: '2024-01-02', amount: 200, balance: 4800, lineNumber: 2, description: 'purchase' }
    ]);
    expect(txs[1].amount).toBe(-200);
    expect(txs[1].type).toBe('DEBIT');
  });

  it('keeps inflow when balance rises by amount', () => {
    const txs = applyBalanceSequenceSigns([
      { date: '2024-01-01', amount: 0, balance: 1000, lineNumber: 1 },
      { date: '2024-01-02', amount: 500, balance: 1500, lineNumber: 2 }
    ]);
    expect(txs[1].amount).toBe(500);
  });

  it('uses line order when transaction dates are invalid', () => {
    const txs = applyBalanceSequenceSigns([
      { date: 'not-a-date', amount: 100, balance: 1100, lineNumber: 1 },
      { date: 'not-a-date', amount: 50, balance: 1050, lineNumber: 2 }
    ]);
    expect(txs[1].amount).toBe(-50);
  });
});

describe('normalizeTransactionsWithBalanceInference', () => {
  it('combines balance inference with ledger normalization', () => {
    const out = normalizeTransactionsWithBalanceInference([
      { date: '2024-01-01', amount: 0, balance: 5000, lineNumber: 1 },
      { date: '2024-01-02', amount: 200, balance: 4800, lineNumber: 2 }
    ]);
    expect(out[1].amount).toBe(-200);
    expect(out[1].type).toBe('DEBIT');
  });
});

describe('Helios-aligned pipeline (inference + totals + NSF)', () => {
  it('treats unsigned debits as outflows so withdrawals and NSF both see the same signed rows', () => {
    const raw = [
      { date: '2024-01-01', amount: 0, balance: 1000, lineNumber: 1, description: 'Opening' },
      { date: '2024-01-02', amount: 50, balance: 950, lineNumber: 2, description: 'NSF FEE' },
      { date: '2024-01-03', amount: 100, balance: 1050, lineNumber: 3, description: 'Deposit' }
    ];
    const normalized = normalizeTransactionsWithBalanceInference(raw);
    const totals = riskAnalysisService.calculateTotalDepositsAndWithdrawals(normalized);
    const nsfCount = riskAnalysisService.calculateNSFCount(normalized);
    expect(totals.totalWithdrawals).toBe(50);
    expect(totals.totalDeposits).toBe(100);
    expect(nsfCount).toBeGreaterThanOrEqual(1);
  });
});
