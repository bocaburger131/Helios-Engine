import { describe, it, expect, beforeAll } from 'vitest';

const runIntegration = process.env.RUN_INTEGRATION_TESTS === 'true';

describe.skipIf(!runIntegration)('statement processing integration', () => {
  beforeAll(() => {
    process.env.USE_REDIS = 'true';
    process.env.NODE_ENV = 'development';
  });

  it('Redis queue accepts jobs and reports waiting status', async () => {
    const {
      isStatementQueueAvailable,
      enqueueStatementBatchJob,
      getStatementJobStatus
    } = await import('../../src/services/statementProcessingQueue.js');

    const available = await isStatementQueueAvailable();
    expect(available).toBe(true);

    const jobId = `integration-${Date.now()}`;
    const job = await enqueueStatementBatchJob({
      jobId,
      uploadSessionId: 'integration_test_session',
      correlationId: `corr-${jobId}`,
      userId: 'integration-test'
    });

    expect(job?.id).toBeTruthy();

    const status = await getStatementJobStatus(String(job.id));
    expect(status).toBeTruthy();
    expect(['waiting', 'delayed', 'active', 'processing', 'completed']).toContain(status.status);
  });

  it('batch progress is readable after write (cross-process store)', async () => {
    const { setBatchProgress, getBatchProgress, clearBatchProgress } = await import(
      '../../src/services/batchProgressStore.js'
    );

    const correlationId = `integration-progress-${Date.now()}`;
    await setBatchProgress(correlationId, {
      phase: 'parsing',
      fileName: 'test.pdf',
      message: 'Integration probe'
    });

    const progress = await getBatchProgress(correlationId);
    expect(progress).toBeTruthy();
    expect(progress.phase).toBe('parsing');
    expect(progress.fileName).toBe('test.pdf');

    await clearBatchProgress(correlationId);
    const cleared = await getBatchProgress(correlationId);
    expect(cleared).toBeNull();
  });
});

describe('statement processing integration (skipped)', () => {
  it('documents how to run Redis-gated integration tests', () => {
    if (runIntegration) return;
    expect(process.env.RUN_INTEGRATION_TESTS).not.toBe('true');
  });
});
