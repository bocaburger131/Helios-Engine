import { describe, it, expect, vi, beforeEach } from 'vitest';
import mongoose from 'mongoose';

const txLean = vi.fn().mockResolvedValue([]);
const txFind = vi.fn().mockReturnValue({ lean: txLean });

vi.mock('../../src/models/Statement.js', () => ({
  default: {
    find: vi.fn(() => ({
      lean: vi.fn().mockResolvedValue([{ _id: new mongoose.Types.ObjectId() }])
    }))
  }
}));

vi.mock('../../src/models/Transaction.js', () => ({
  default: { find: txFind }
}));

describe('batch-analysis Transaction query', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    txFind.mockReturnValue({ lean: txLean });
    txLean.mockResolvedValue([]);
  });

  it('loads transactions by statementId, not statement', async () => {
    const mod = await import('../../src/controllers/batch-analysis.controller.js');
    const req = {
      body: {
        statementIds: ['507f1f77bcf86cd799439011', '507f1f77bcf86cd799439012']
      },
      user: { id: new mongoose.Types.ObjectId().toString() }
    };
    const json = vi.fn();
    const res = { status: vi.fn(() => ({ json })), json };
    await mod.analyzeBatch(req, res);
    expect(txFind).toHaveBeenCalled();
    const arg = txFind.mock.calls[0][0];
    expect(arg).toHaveProperty('statementId');
    expect(arg).not.toHaveProperty('statement');
  });
});
