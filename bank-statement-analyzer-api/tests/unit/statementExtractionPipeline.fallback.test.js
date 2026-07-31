import { describe, it, expect, vi, beforeEach } from 'vitest';

const { runRescueMock } = vi.hoisted(() => ({
  runRescueMock: vi.fn(),
}));

const { getCachedRescueMock, setCachedRescueMock } = vi.hoisted(() => ({
  getCachedRescueMock: vi.fn(),
  setCachedRescueMock: vi.fn(),
}));

// Keep the pipeline offline: no OCR, no Redis. The AI diagnostic + rescue
// blocks are gated behind resolveGeminiApiKey() — return a truthy sentinel so
// the blocks RUN, but the orchestrator is mocked so no network call happens.
vi.mock('../../src/services/geminiVisionService.js', () => ({
  resolveGeminiApiKey: () => 'test-key',
}));
vi.mock('../../src/services/aiDiagnosticService.js', () => ({
  runSectionDiagnostic: vi.fn().mockResolvedValue({
    diagnosis: 'UNKNOWN',
    confidenceScore: 0,
    explanation: 'mock',
  }),
}));
vi.mock('../../src/services/aiOrchestratorService.js', () => ({
  runRescue: runRescueMock,
}));
vi.mock('../../src/services/extraction/rescueCache.js', () => ({
  buildRescueCacheKey: () => 'test-cache-key',
  getCachedRescue: getCachedRescueMock,
  setCachedRescue: setCachedRescueMock,
}));
vi.mock('../../src/services/extraction/scanOcrService.js', () => ({
  scanOcrEnabled: () => false,
  extractTransactionsFromPdfBuffer: vi.fn(),
}));

import { runStatementExtractionPipeline } from '../../src/services/extraction/statementExtractionPipeline.js';

const failingProfile = {
  id: 'wells_initiate_checking',
  confidence: 0.9,
  extract: async () => {
    throw new Error('Wells Initiate: could not extract activity summary');
  },
};

function plumberTxn(amount, date = '2025-02-03', page = 2) {
  return {
    date,
    description: 'Card 6932',
    amount,
    type: amount >= 0 ? 'CREDIT' : 'DEBIT',
    page,
    rowFingerprint: `fp-${amount}-${date}`,
  };
}

function baseCtx() {
  return {
    text: 'Wells Fargo statement text',
    altText: '',
    profile: failingProfile,
    defaultYear: 2025,
    resolvedBankType: 'wells',
    plumberTransactions: [plumberTxn(2778.44), plumberTxn(-25)],
    plumberDroppedRows: [
      {
        page: 10,
        drop_reason: 'no_date',
        words: [{ text: 'February 28, 2025 Page 10 of 11', x0: 1, x1: 2, top: 3, bottom: 4 }],
        amount: null,
        nearest_date: '2/28',
        parent_row_id: null,
      },
    ],
    plumberUncertainAssignments: [
      {
        page: 2,
        reason: 'column_boundary',
        token: { text: '2778.44', x0: 400, x1: 430, top: 100, bottom: 110 },
        assigned_column: 3,
        alternative_column: 2,
        distance_to_boundary_pt: 2.0,
      },
    ],
    plumberMeta: {
      openingBalance: 3684.3,
      closingBalance: 608.74,
    },
  };
}

describe('statementExtractionPipeline — profile hard-fail fallback', () => {
  beforeEach(() => {
    runRescueMock.mockReset();
    getCachedRescueMock.mockReset().mockResolvedValue(null);
    setCachedRescueMock.mockReset().mockResolvedValue(undefined);
    process.env.OCR_ENABLED = 'false';
  });

  it('runs rescue on plumber evidence when profile.extract() throws (February path)', async () => {
    // AI returns a grounded keep for the uncertain assignment and a discard
    // for the dropped row. All accepted → rescueCandidates materialize.
    runRescueMock.mockResolvedValue([
      {
        decision: 'keep',
        confidence: 0.95,
        reason: 'token already counted in ledger',
        evidence: [{ text: '2778.44' }],
        proposed_column: 3,
        proposed_amount: 2778.44,
      },
      {
        decision: 'discard',
        confidence: 0.99,
        reason: 'footer page marker, not a transaction',
        evidence: [{ text: 'February 28, 2025 Page 10 of 11' }],
      },
    ]);

    const result = await runStatementExtractionPipeline(baseCtx());

    // No rethrow; plumber evidence carried through.
    expect(result.transactions.length).toBe(2);
    expect(result.meta.rescueOutcome).toBe('RESCUE_REJECTED');
    // Both candidates are exposed for the dual-engine selector.
    expect(Array.isArray(result.rescueCandidates)).toBe(true);
    expect(result.rescueCandidates.length).toBe(2);
    const sources = result.rescueCandidates.map((c) => c.source).sort();
    expect(sources).toEqual(['plumber_base', 'plumber_repaired']);
    // Rejected repair: plumber_repaired must be labeled rejected, not applied.
    const repaired = result.rescueCandidates.find((c) => c.source === 'plumber_repaired');
    expect(repaired.rescueOutcome).toBe('RESCUE_REJECTED');
    // AI actually ran (not skipped).
    expect(runRescueMock).toHaveBeenCalled();
    expect(setCachedRescueMock).toHaveBeenCalled();
  });

  it('rethrows when no plumber evidence exists', async () => {
    const ctx = baseCtx();
    ctx.plumberTransactions = [];
    ctx.plumberDroppedRows = [];
    ctx.plumberUncertainAssignments = [];
    await expect(runStatementExtractionPipeline(ctx)).rejects.toThrow(
      'Wells Initiate: could not extract activity summary'
    );
  });

  it('keeps base when rescue does not improve the ledger', async () => {
    // Identical base/repaired ledgers → repaired delta equals base delta →
    // base kept, rescueCandidates still expose both with rejected labels.
    runRescueMock.mockResolvedValue([
      {
        decision: 'keep',
        confidence: 0.9,
        reason: 'consistent',
        evidence: [{ text: '2778.44' }],
        proposed_column: 3,
        proposed_amount: 2778.44,
      },
    ]);
    const result = await runStatementExtractionPipeline(baseCtx());
    expect(result.meta.rescueOutcome).toBe('RESCUE_REJECTED');
    expect(result.transactions.length).toBe(2);
  });
});
