import { describe, it, expect } from 'vitest';
import {
  coerceVisionTransactionRows,
  normalizeVisionTransactionRow,
  rowFallbackEnabled
} from '../../src/services/geminiVisionService.js';

describe('coerceVisionTransactionRows', () => {
  it('maps CREDIT/DEBIT rows to signed ledger amounts', () => {
    const out = coerceVisionTransactionRows(
      {
        transactions: [
          { date: '12/1', description: 'Payroll deposit', amount: 200, type: 'CREDIT' },
          { date: '12/2', description: 'POS purchase', amount: 50, type: 'DEBIT' }
        ],
        openingBalance: 1000,
        closingBalance: 1150
      },
      2024
    );
    expect(out.transactions).toHaveLength(2);
    expect(out.transactions[0].amount).toBe(200);
    expect(out.transactions[1].amount).toBe(-50);
    expect(out.openingBalance).toBe(1000);
    expect(out.closingBalance).toBe(1150);
  });

  it('skips invalid rows', () => {
    const out = coerceVisionTransactionRows({
      transactions: [
        { date: '12/1', description: '', amount: 10, type: 'CREDIT' },
        { date: '12/2', description: 'Valid', amount: 0, type: 'DEBIT' }
      ]
    });
    expect(out.transactions).toHaveLength(0);
  });
});

describe('normalizeVisionTransactionRow', () => {
  it('normalizes MM/DD dates with default year', () => {
    const row = normalizeVisionTransactionRow(
      { date: '1/15', description: 'ACH', amount: 100, type: 'CREDIT' },
      2025
    );
    expect(row.date).toBe('2025-01-15');
  });

  it('tags extractionSource as ai_vision_fallback with legacy alias', () => {
    const row = normalizeVisionTransactionRow(
      { date: '1/15', description: 'ACH', amount: 100, type: 'CREDIT' },
      2025
    );
    expect(row.extractionSource).toBe('ai_vision_fallback');
    expect(row.extractionSourceLegacy).toBe('gemini_row_fallback');
  });
});

describe('rowFallbackEnabled', () => {
  it('is false when GEMINI_VISION_ROW_FALLBACK=0', () => {
    const prev = process.env.GEMINI_VISION_ROW_FALLBACK;
    process.env.GEMINI_VISION_ROW_FALLBACK = '0';
    expect(rowFallbackEnabled()).toBe(false);
    if (prev === undefined) delete process.env.GEMINI_VISION_ROW_FALLBACK;
    else process.env.GEMINI_VISION_ROW_FALLBACK = prev;
  });
});
