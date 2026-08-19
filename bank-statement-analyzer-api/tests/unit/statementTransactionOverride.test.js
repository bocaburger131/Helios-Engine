import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/models/Transaction.js', () => ({
  default: {
    findOneAndUpdate: vi.fn(),
    find: vi.fn()
  }
}));

import Transaction from '../../src/models/Transaction.js';
import {
  validateCategorizerOverrideBody,
  normalizeHighLevelCategory
} from '../../src/utils/categorizerTaxonomy.js';
import { patchStatementTransactionOverride } from '../../src/services/statementTransactionOverrideService.js';

describe('categorizerTaxonomy', () => {
  it('normalizes legacy AI labels into high-level buckets', () => {
    expect(normalizeHighLevelCategory('OpEx (Operations & Rent)')).toBe('OPEX');
    expect(normalizeHighLevelCategory('COGS (Equipment & Inventory)')).toBe('COGS');
    expect(normalizeHighLevelCategory('non_revenue_transfer')).toBe('NON-REVENUE TRANSFER');
  });

  it('rejects invalid override bodies', () => {
    const bad = validateCategorizerOverrideBody({ category: 'Groceries' });
    expect(bad.ok).toBe(false);
  });

  it('accepts valid category + subcategory + tax', () => {
    const ok = validateCategorizerOverrideBody({
      category: 'OpEx',
      subcategory: 'Rent',
      taxDeductible: 'deductible'
    });
    expect(ok).toMatchObject({
      ok: true,
      category: 'OPEX',
      subcategory: 'RENT',
      taxDeductible: 'deductible'
    });
  });
});

describe('patchStatementTransactionOverride', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('updates txn, marks analyst_override, returns vitals', async () => {
    const updated = {
      _id: '507f1f77bcf86cd799439011',
      statementId: '507f1f77bcf86cd799439012',
      category: 'NON-REVENUE TRANSFER',
      categorizationSource: 'analyst_override',
      flags: { isReviewed: true },
      type: 'DEBIT',
      amount: 15000
    };
    Transaction.findOneAndUpdate.mockReturnValue({
      lean: vi.fn().mockResolvedValue(updated)
    });
    Transaction.find.mockReturnValue({
      select: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue([
          { type: 'CREDIT', amount: 20000, category: 'INCOME' },
          updated
        ])
      })
    });

    const result = await patchStatementTransactionOverride(
      '507f1f77bcf86cd799439012',
      '507f1f77bcf86cd799439011',
      { category: 'Non-Revenue Transfer', subcategory: 'Owner Draw' }
    );

    expect(result.ok).toBe(true);
    expect(result.transaction.categorizationSource).toBe('analyst_override');
    expect(result.transaction.flags.isReviewed).toBe(true);
    expect(Transaction.findOneAndUpdate).toHaveBeenCalledWith(
      {
        _id: '507f1f77bcf86cd799439011',
        statementId: '507f1f77bcf86cd799439012'
      },
      expect.objectContaining({
        $set: expect.objectContaining({
          category: 'NON-REVENUE TRANSFER',
          subcategory: 'OWNER DRAW',
          categorizationSource: 'analyst_override',
          'flags.isReviewed': true
        })
      }),
      expect.any(Object)
    );
    expect(result.vitals.netCashFlow).toBe(5000);
    expect(result.vitals.trueMonthlyRevenue).toBe(20000);
  });

  it('returns 404 when txn not on statement', async () => {
    Transaction.findOneAndUpdate.mockReturnValue({
      lean: vi.fn().mockResolvedValue(null)
    });
    const result = await patchStatementTransactionOverride(
      '507f1f77bcf86cd799439012',
      '507f1f77bcf86cd799439011',
      { category: 'OPEX' }
    );
    expect(result).toMatchObject({ ok: false, status: 404 });
  });

  it('returns 400 on validation failure', async () => {
    const result = await patchStatementTransactionOverride(
      '507f1f77bcf86cd799439012',
      '507f1f77bcf86cd799439011',
      { category: 'Nope' }
    );
    expect(result.ok).toBe(false);
    expect(result.status).toBe(400);
    expect(Transaction.findOneAndUpdate).not.toHaveBeenCalled();
  });
});
