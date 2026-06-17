import { describe, it, expect, vi } from 'vitest';
import mongoose from 'mongoose';
import {
  buildMacroTransactionDocs,
  insertTransactionDocsChunked,
  CHUNK_SIZE
} from '../../src/utils/macroTransactionPersist.js';

describe('macroTransactionPersist', () => {
  const ctx = {
    statementId: new mongoose.Types.ObjectId(),
    userId: new mongoose.Types.ObjectId()
  };

  it('buildMacroTransactionDocs skips invalid rows', () => {
    const { txnDocs, skipped, attempted } = buildMacroTransactionDocs(
      [
        { date: '2024-12-01', amount: 10, description: 'ok' },
        { date: 'bad-date', amount: 5 },
        { date: '2024-12-02', amount: NaN }
      ],
      ctx
    );
    expect(attempted).toBe(3);
    expect(txnDocs).toHaveLength(1);
    expect(skipped.invalidDate).toBe(1);
    expect(skipped.invalidAmount).toBe(1);
    expect(txnDocs[0].type).toBe('CREDIT');
  });

  it('insertTransactionDocsChunked batches large sets', async () => {
    const insertMany = vi
      .fn()
      .mockImplementation((docs) => Promise.resolve(docs));
    const Model = { insertMany };
    const docs = Array.from({ length: CHUNK_SIZE + 10 }, (_, i) => ({
      statementId: ctx.statementId,
      userId: ctx.userId,
      date: new Date('2024-12-01'),
      amount: i,
      type: 'CREDIT',
      description: 't'
    }));

    const result = await insertTransactionDocsChunked(Model, docs);
    expect(insertMany).toHaveBeenCalledTimes(2);
    expect(result.persisted).toBe(CHUNK_SIZE + 10);
    expect(result.error).toBeNull();
  });
});
