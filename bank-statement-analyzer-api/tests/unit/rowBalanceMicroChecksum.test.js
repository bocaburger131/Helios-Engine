/**
 * Unit tests for validateRowRunningBalances (micro-checksum).
 */
import { describe, expect, it } from 'vitest';
import { validateRowRunningBalances } from '../../src/services/extraction/statementReconciliation.js';

describe('validateRowRunningBalances', () => {
  it('passes a clean running-balance chain', () => {
    const result = validateRowRunningBalances(
      [
        { amount: 100, balance: 1100, description: 'deposit' },
        { amount: -50, balance: 1050, description: 'withdrawal' },
        { amount: 25, balance: 1075, description: 'deposit' }
      ],
      { openingBalance: 1000 }
    );
    expect(result.ok).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  it('flags the exact middle row when math breaks', () => {
    const result = validateRowRunningBalances(
      [
        { amount: 100, balance: 1100, description: 'ok', page: 1 },
        { amount: -50, balance: 1000, description: 'broken', page: 2 },
        { amount: 25, balance: 1025, description: 'after', page: 2 }
      ],
      { openingBalance: 1000 }
    );
    expect(result.ok).toBe(false);
    expect(result.violations.length).toBeGreaterThanOrEqual(1);
    const first = result.violations[0];
    expect(first.rowIndex).toBe(1);
    expect(first.page).toBe(2);
    expect(Math.abs(first.delta - 50)).toBeLessThan(0.011);
  });

  it('skips rows without balance', () => {
    const result = validateRowRunningBalances(
      [
        { amount: 100, description: 'no bal' },
        { amount: -20, balance: 980, description: 'has bal' }
      ],
      { openingBalance: 1000 }
    );
    expect(result.ok).toBe(true);
  });
});
