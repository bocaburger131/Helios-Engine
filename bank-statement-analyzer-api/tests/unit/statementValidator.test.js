import { describe, it, expect } from 'vitest';
import { validateStatement } from '../../src/utils/statementValidator.js';

function baseStmt(overrides = {}) {
  return {
    fileName: 'feb.pdf',
    accountNumber: '1234567890',
    openingBalance: 100,
    closingBalance: 200,
    statementDate: '2025-02-15',
    transactions: [
      { date: '2025-02-01', description: 'Deposit', amount: 100, balance: 200 }
    ],
    parseResult: {
      metadata: { pageCount: 2 },
      statementPeriod: { start: '2025-02-01', end: '2025-02-28' }
    },
    stitcher: {
      typeA: { printed: { opening: 100, closing: 200 } },
      pages: 2
    },
    ...overrides
  };
}

describe('statementValidator', () => {
  it('passes when arithmetic and tiers are satisfied', () => {
    const report = validateStatement(baseStmt());
    expect(report.arithmetic.ok).toBe(true);
    expect(report.structural.ok).toBe(true);
    expect(report.temporal.ok).toBe(true);
    expect(report.overallOk).toBe(true);
  });

  it('fails arithmetic when reconciliation delta exceeds tolerance', () => {
    const report = validateStatement(
      baseStmt({
        closingBalance: 999,
        stitcher: { typeA: { printed: { opening: 100, closing: 999 } }, pages: 2 }
      })
    );
    expect(report.arithmetic.ok).toBe(false);
    expect(report.overallOk).toBe(false);
  });

  it('flags transactions outside statement period', () => {
    const report = validateStatement(
      baseStmt({
        transactions: [
          { date: '2024-01-01', description: 'Old', amount: 10, balance: 110 }
        ]
      })
    );
    expect(report.temporal.ok).toBe(false);
    expect(report.overallOk).toBe(false);
  });

  it('detects duplicate fingerprint loops', () => {
    const dup = {
      date: '2025-02-05',
      description: 'Same charge',
      amount: -25,
      balance: 75
    };
    const report = validateStatement(
      baseStmt({
        transactions: [dup, { ...dup }, { ...dup }]
      })
    );
    expect(report.duplication.ok).toBe(false);
    expect(report.overallOk).toBe(false);
  });

  it('allows reversal pairs within 48h window', () => {
    const report = validateStatement(
      baseStmt({
        transactions: [
          { date: '2025-02-01', description: 'ACH', amount: 100, balance: 200 },
          { date: '2025-02-02', description: 'ACH REV', amount: -100, balance: 100 }
        ]
      })
    );
    expect(report.duplication.reversalPairs.length).toBeGreaterThan(0);
    expect(report.duplication.ok).toBe(true);
  });

  it('attaches non-blocking risk flags', () => {
    const txs = [];
    for (let i = 0; i < 20; i++) {
      txs.push({
        date: '2025-02-01',
        description: 'Round',
        amount: 500,
        balance: 1000 + i
      });
    }
    const report = validateStatement(baseStmt({ transactions: txs }));
    expect(report.risk.flags.length).toBeGreaterThan(0);
    expect(report.overallOk).toBe(report.arithmetic.ok);
  });
});
