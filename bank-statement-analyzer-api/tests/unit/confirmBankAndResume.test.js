import { describe, it, expect, vi, beforeEach } from 'vitest';

const saveConfirmedBankForSession = vi.fn();
const loadTriageSession = vi.fn();
const enqueueStatementBatchJob = vi.fn().mockResolvedValue({ id: 'job-abc' });
const isStatementQueueAvailable = vi.fn().mockResolvedValue(true);

vi.mock('../../src/services/triageSessionService.js', () => ({
  loadTriageSession,
  saveConfirmedBankForSession,
  createUploadSessionId: vi.fn(),
  saveTriageSession: vi.fn(),
  updateTriageSessionMeta: vi.fn(),
  getConfirmedBankForFile: vi.fn()
}));

vi.mock('../../src/services/statementProcessingQueue.js', () => ({
  enqueueStatementBatchJob,
  isStatementQueueAvailable,
  getStatementJobStatus: vi.fn()
}));

vi.mock('../../src/utils/bankConfirmationGate.js', () => ({
  resolveBankIdFromName: (name) => (name === 'Chase' ? 'chase' : null)
}));

describe('confirmBankAndResume', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    loadTriageSession.mockReturnValue({
      files: [],
      manifest: { meta: { dealId: 'deal-1' } }
    });
  });

  it('persists confirmed bank before enqueue', async () => {
    const { default: StatementController } = await import(
      '../../src/controllers/statementController.js'
    );

    const json = vi.fn();
    const status = vi.fn().mockReturnValue({ json });
    const req = {
      body: {
        uploadSessionId: 'triage_abc',
        fileName: 'Jan_2025.pdf',
        confirmedBankName: 'Chase'
      },
      user: { id: 'user-1' }
    };
    const res = { status };

    await StatementController.confirmBankAndResume(req, res);

    expect(saveConfirmedBankForSession).toHaveBeenCalledTimes(1);
    expect(enqueueStatementBatchJob).toHaveBeenCalledTimes(1);
    expect(saveConfirmedBankForSession.mock.invocationCallOrder[0]).toBeLessThan(
      enqueueStatementBatchJob.mock.invocationCallOrder[0]
    );
    expect(saveConfirmedBankForSession).toHaveBeenCalledWith('triage_abc', {
      fileName: 'Jan_2025.pdf',
      bankName: 'Chase',
      bankId: 'chase'
    });
    expect(enqueueStatementBatchJob).toHaveBeenCalledWith(
      expect.objectContaining({
        uploadSessionId: 'triage_abc',
        confirmedBankName: 'Chase',
        confirmedBankFileName: 'Jan_2025.pdf'
      })
    );
    expect(status).toHaveBeenCalledWith(202);
  });
});
