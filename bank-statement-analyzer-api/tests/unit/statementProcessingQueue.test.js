import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockAdd = vi.fn().mockResolvedValue({ id: 'job-1' });
const mockGetJob = vi.fn();
const mockGetState = vi.fn();

vi.mock('bullmq', () => ({
  Queue: vi.fn().mockImplementation(() => ({
    add: mockAdd,
    getJob: mockGetJob,
    client: Promise.resolve({ ping: vi.fn().mockResolvedValue('PONG') })
  }))
}));

vi.mock('../../src/config/bullMqConnection.js', () => ({
  getBullMqConnection: () => ({ host: 'localhost', port: 6379 })
}));

describe('statementProcessingQueue', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('enqueueStatementBatchJob passes jobId in payload', async () => {
    const { enqueueStatementBatchJob } = await import('../../src/services/statementProcessingQueue.js');
    await enqueueStatementBatchJob({
      jobId: 'test-job-id',
      uploadSessionId: 'triage_1',
      userId: 'user1'
    });
    expect(mockAdd).toHaveBeenCalledWith(
      'parse-and-macro',
      expect.objectContaining({ jobId: 'test-job-id', uploadSessionId: 'triage_1' }),
      expect.objectContaining({ jobId: 'test-job-id' })
    );
  });

  it('getStatementJobStatus maps requires_bank_confirmation returnvalue', async () => {
    mockGetJob.mockResolvedValue({
      id: 'job-hitl',
      data: { correlationId: 'corr-1' },
      returnvalue: {
        status: 'requires_bank_confirmation',
        uploadSessionId: 'triage_1',
        fileName: 'stmt.pdf',
        detectedBankName: 'Chase'
      },
      getState: () => Promise.resolve('completed')
    });

    const { getStatementJobStatus } = await import('../../src/services/statementProcessingQueue.js');
    const status = await getStatementJobStatus('job-hitl');
    expect(status.status).toBe('requires_bank_confirmation');
    expect(status.fileName).toBe('stmt.pdf');
  });

  it('getStatementJobStatus maps COMPLETED_WITH_WARNINGS returnvalue with result', async () => {
    const envelope = {
      success: true,
      businessStatus: 'COMPLETED_WITH_WARNINGS',
      data: { id: 'stmt-abc' },
      diagnosticSummaries: [{ fileName: 'dec.pdf', diagnosis: 'MISALIGNED_COLUMNS' }]
    };
    mockGetJob.mockResolvedValue({
      id: 'job-warn',
      data: { correlationId: 'corr-warn' },
      returnvalue: {
        status: 'COMPLETED_WITH_WARNINGS',
        result: envelope,
        diagnosticSummaries: envelope.diagnosticSummaries
      },
      getState: () => Promise.resolve('completed')
    });

    const { getStatementJobStatus } = await import('../../src/services/statementProcessingQueue.js');
    const status = await getStatementJobStatus('job-warn');
    expect(status.status).toBe('COMPLETED_WITH_WARNINGS');
    expect(status.result).toEqual(envelope);
    expect(status.diagnosticSummaries).toHaveLength(1);
    expect(status.correlationId).toBe('corr-warn');
  });
});
