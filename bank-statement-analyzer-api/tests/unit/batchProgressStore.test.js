import { describe, it, expect, beforeEach } from 'vitest';

describe('batchProgressStore', () => {
  beforeEach(() => {
    process.env.NODE_ENV = 'test';
  });

  it('stores and retrieves progress in memory during tests', async () => {
    const { setBatchProgress, getBatchProgress, clearBatchProgress } = await import(
      '../../src/services/batchProgressStore.js'
    );

    const id = 'corr-unit-test';
    await setBatchProgress(id, { phase: 'checksum_recovery', message: 'Rescuing…' });
    const progress = await getBatchProgress(id);
    expect(progress?.phase).toBe('checksum_recovery');
    expect(progress?.message).toBe('Rescuing…');

    await clearBatchProgress(id);
    expect(await getBatchProgress(id)).toBeNull();
  });
});
