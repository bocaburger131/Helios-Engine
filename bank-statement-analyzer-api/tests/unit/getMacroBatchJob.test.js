import { describe, it, expect, vi, beforeEach } from 'vitest';

const getStatementJobStatus = vi.fn();

vi.mock('../../src/services/statementProcessingQueue.js', () => ({
  getStatementJobStatus,
  enqueueStatementBatchJob: vi.fn(),
  isStatementQueueAvailable: vi.fn()
}));

describe('getMacroBatchJob', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('forwards result and diagnosticSummaries for COMPLETED_WITH_WARNINGS', async () => {
    const envelope = {
      success: true,
      businessStatus: 'COMPLETED_WITH_WARNINGS',
      data: { id: 'stmt-123' },
      diagnosticSummaries: [
        {
          fileName: 'dec.pdf',
          diagnosis: 'MISALIGNED_COLUMNS',
          explanation: 'Parsed deposits are 2.4x printed deposits.',
          confidenceScore: 0.87,
          autoCorrected: false
        }
      ]
    };
    getStatementJobStatus.mockResolvedValue({
      jobId: 'job-700',
      status: 'COMPLETED_WITH_WARNINGS',
      correlationId: 'corr-700',
      result: envelope,
      diagnosticSummaries: envelope.diagnosticSummaries
    });

    const { default: StatementController } = await import(
      '../../src/controllers/statementController.js'
    );

    const json = vi.fn();
    const status = vi.fn().mockReturnValue({ json });
    const req = { params: { jobId: 'job-700' } };
    const res = { status };

    await StatementController.getMacroBatchJob(req, res);

    expect(getStatementJobStatus).toHaveBeenCalledWith('job-700');
    expect(status).toHaveBeenCalledWith(200);
    expect(json).toHaveBeenCalledWith({
      success: true,
      jobId: 'job-700',
      status: 'COMPLETED_WITH_WARNINGS',
      result: envelope,
      diagnosticSummaries: envelope.diagnosticSummaries,
      correlationId: 'corr-700'
    });
  });

  it('falls back to result.diagnosticSummaries when top-level list is empty', async () => {
    const envelope = {
      success: true,
      businessStatus: 'COMPLETED_WITH_WARNINGS',
      data: { id: 'stmt-456' },
      diagnosticSummaries: [{ fileName: 'jan.pdf', diagnosis: 'CHECKSUM_MISMATCH' }]
    };
    getStatementJobStatus.mockResolvedValue({
      jobId: 'job-701',
      status: 'COMPLETED_WITH_WARNINGS',
      correlationId: 'corr-701',
      result: envelope,
      diagnosticSummaries: []
    });

    const { default: StatementController } = await import(
      '../../src/controllers/statementController.js'
    );

    const json = vi.fn();
    const status = vi.fn().mockReturnValue({ json });

    await StatementController.getMacroBatchJob({ params: { jobId: 'job-701' } }, { status });

    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'COMPLETED_WITH_WARNINGS',
        result: envelope,
        diagnosticSummaries: envelope.diagnosticSummaries
      })
    );
  });

  it('returns completed result payload unchanged', async () => {
    const envelope = { success: true, data: { id: 'stmt-789' } };
    getStatementJobStatus.mockResolvedValue({
      jobId: 'job-702',
      status: 'completed',
      correlationId: 'corr-702',
      result: envelope
    });

    const { default: StatementController } = await import(
      '../../src/controllers/statementController.js'
    );

    const json = vi.fn();
    const status = vi.fn().mockReturnValue({ json });

    await StatementController.getMacroBatchJob({ params: { jobId: 'job-702' } }, { status });

    expect(json).toHaveBeenCalledWith({
      success: true,
      jobId: 'job-702',
      status: 'completed',
      result: envelope,
      correlationId: 'corr-702'
    });
  });
});
