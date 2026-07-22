import { describe, it, expect, vi } from 'vitest';
import { createPipelineOutcomeCollector } from '../../src/services/statementBatchPipelineService.js';

describe('createPipelineOutcomeCollector', () => {
  it('captures COMPLETED_WITH_WARNINGS envelope for worker job poll', () => {
    const settle = vi.fn();
    const res = createPipelineOutcomeCollector(settle);
    const envelope = {
      success: true,
      businessStatus: 'COMPLETED_WITH_WARNINGS',
      data: { id: 'stmt-upload-hub' },
      diagnosticSummaries: [
        { fileName: 'feb.pdf', diagnosis: 'MISALIGNED_COLUMNS', explanation: 'test' }
      ]
    };

    res.status(201).json(envelope);

    expect(settle).toHaveBeenCalledWith({
      status: 'COMPLETED_WITH_WARNINGS',
      result: envelope,
      diagnosticSummaries: envelope.diagnosticSummaries
    });
  });

  it('marks institution profile gate 202 as failed (not completed)', () => {
    const settle = vi.fn();
    const res = createPipelineOutcomeCollector(settle);
    res.status(202).json({
      success: false,
      error: 'INSTITUTION_PROFILE_STEP1_REQUIRED',
      institutionProfileGate: { step1Required: true }
    });

    expect(settle).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'failed',
        error: 'INSTITUTION_PROFILE_STEP1_REQUIRED'
      })
    );
  });
});
