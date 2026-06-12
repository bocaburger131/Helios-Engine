import { describe, it, expect } from 'vitest';
import {
  parsePlumberRowDate,
  normalizePlumberRow,
  normalizePlumberJson
} from '../../src/services/extraction/plumberRowNormalizer.js';
import { mapPlumberRowsToChaseNormalized } from '../../src/services/extraction/profiles/chaseBusinessCompleteProfile.js';

describe('plumberRowNormalizer', () => {
  it('parsePlumberRowDate accepts MM/DD, MM/DD/YYYY, and ISO', () => {
    expect(parsePlumberRowDate('02/01', 2025)).toBe('2025-02-01');
    expect(parsePlumberRowDate('02/01/2025', 2025)).toBe('2025-02-01');
    expect(parsePlumberRowDate('2025-02-01', 2025)).toBe('2025-02-01');
  });

  it('normalizePlumberRow preserves section and dateRaw', () => {
    const row = normalizePlumberRow(
      {
        date: '02/01',
        description: 'Deposit',
        amount: 100,
        type: 'CREDIT',
        section: 'deposits'
      },
      2025
    );
    expect(row?.section).toBe('deposits');
    expect(row?.dateRaw).toBe('02/01');
    expect(row?.date).toBe('2025-02-01');
  });

  it('normalizePlumberJson maps Python stdout without vision coercion', () => {
    const { transactions } = normalizePlumberJson(
      {
        transactions: [
          { date: '01/15', description: 'Vendor', amount: 200, type: 'CREDIT', section: 'deposits' }
        ]
      },
      2025
    );
    expect(transactions).toHaveLength(1);
    expect(transactions[0].section).toBe('deposits');
  });

  it('Chase mapper preserves DEBIT when section tag is wrong (Capri bleed case)', () => {
    const { transactions } = normalizePlumberJson(
      {
        transactions: [
          { date: '01/05', description: 'Check 1001', amount: 500, type: 'DEBIT', section: 'deposits' },
          { date: '01/06', description: 'Zelle Payment', amount: 200, type: 'CREDIT', section: 'deposits' }
        ]
      },
      2025
    );
    const mapped = mapPlumberRowsToChaseNormalized(transactions, 2025, { log: false });
    expect(mapped.find((r) => r.description.includes('Check'))?.amount).toBeLessThan(0);
    expect(mapped.find((r) => r.description.includes('Zelle'))?.amount).toBeGreaterThan(0);
    expect(mapped.filter((r) => r.amount > 0).length).toBe(1);
    expect(mapped.filter((r) => r.amount < 0).length).toBe(1);
  });

  it('Chase mapper outCount > 0 for ISO-normalized Capri-style rows', () => {
    const { transactions } = normalizePlumberJson(
      {
        transactions: Array.from({ length: 5 }, (_, i) => ({
          date: `02/${String(i + 1).padStart(2, '0')}`,
          description: `Payment ${i}`,
          amount: 100 + i,
          type: i % 2 === 0 ? 'CREDIT' : 'DEBIT',
          section: i % 2 === 0 ? 'deposits' : 'checks'
        }))
      },
      2025
    );
    const mapped = mapPlumberRowsToChaseNormalized(transactions, 2025, { log: false });
    expect(mapped.length).toBeGreaterThan(0);
    expect(mapped.some((r) => r.amount > 0)).toBe(true);
  });
});
