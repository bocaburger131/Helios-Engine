import { describe, it, expect, vi, beforeEach } from 'vitest';
// Mock dependencies
vi.mock('../../src/controllers/statementController.js', () => {
  // The default export is the StatementController class, which jobQueueService
  // imports and calls as `statementController.processMultipleStatements(...)`.
  // We expose a plain object as the default so the mock method is directly accessible.
  const mockDefault = {
    processMultipleStatements: vi.fn().mockResolvedValue(undefined)
  };

  const StatementController = vi.fn().mockImplementation(() => mockDefault);

  return {
    __esModule: true,
    default: mockDefault,
    StatementController,
    __getMockInstance: () => mockDefault
  };
});

import jobQueueService from '../../src/services/jobQueueService.js';
import logger from '../../src/utils/logger.js';
import { StatementController, __getMockInstance } from '../../src/controllers/statementController.js';

vi.mock('../../src/utils/logger.js', () => ({
  default: {
    info: vi.fn(),
    error: vi.fn()
  }
}));

describe('JobQueueService', () => {
  beforeEach(() => {
    const instance = __getMockInstance();
    if (instance?.processMultipleStatements) {
      instance.processMultipleStatements.mockReset();
      instance.processMultipleStatements.mockResolvedValue(undefined);
    }

    logger.info.mockReset();
    logger.error.mockReset();

    // Reset queue
    jobQueueService.queue = [];
    jobQueueService.isProcessing = false;
  });

  it('should add jobs to queue', () => {
    const job = { dealId: '123', files: [] };
    jobQueueService.addJob(job);
    
    expect(jobQueueService.queue.length).toBe(1);
    expect(logger.info).toHaveBeenCalled();
  });

  it('should process jobs in order', async () => {
    const job1 = { dealId: '123', files: [] };
    const job2 = { dealId: '456', files: [] };
    
    jobQueueService.addJob(job1);
    jobQueueService.addJob(job2);
    
    expect(jobQueueService.queue.length).toBe(2);
    
    // Let the queue process
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    expect(jobQueueService.queue.length).toBe(0);
    const instance = __getMockInstance();
    expect(instance.processMultipleStatements).toHaveBeenCalledTimes(2);
    expect(instance.processMultipleStatements).toHaveBeenNthCalledWith(1, job1.dealId, job1.files);
    expect(instance.processMultipleStatements).toHaveBeenNthCalledWith(2, job2.dealId, job2.files);
  });

  it('should retry failed jobs', async () => {
    const instance = __getMockInstance();
    const mockError = new Error('Test error');
    instance.processMultipleStatements
      .mockRejectedValueOnce(mockError)
      .mockResolvedValueOnce(undefined);

    const job = { dealId: '123', files: [] };
    const jobId = jobQueueService.addJob(job);
    
    await new Promise(resolve => setTimeout(resolve, 2500));

    expect(instance.processMultipleStatements).toHaveBeenCalledTimes(2);
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('Job failed for Deal ID'),
      expect.objectContaining({ dealId: job.dealId })
    );
    expect(jobQueueService.getJobStatus(jobId)).toBeNull();
  });

  it('should maintain queue status', () => {
    const job1 = { dealId: '123', files: [] };
    const job2 = { dealId: '456', files: [] };
    
    jobQueueService.addJob(job1);
    jobQueueService.addJob(job2);
    
    const status = jobQueueService.getQueueStatus();
    
    expect(status.queueLength).toBe(2);
    expect(status.isProcessing).toBe(true);
    expect(status.pendingJobs).toHaveLength(2);
  });
});
