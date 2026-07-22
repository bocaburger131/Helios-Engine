import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/services/visionLayoutCacheService.js', () => ({
  clearVisionLayoutCacheForRtn: vi.fn(async (rtn) => ({
    deleted: 1,
    rtn,
    keys: [`vision:layout:v2:${rtn}:wells_fargo`]
  }))
}));

vi.mock('../../src/services/institutionalTemplatePersist.js', () => ({
  persistLearningTemplate: vi.fn(async () => ({ version: 1, status: 'LEARNING' })),
  getLatestLearnableTemplate: vi.fn(() => null)
}));

vi.mock('../../src/services/bankEnrichmentService.js', () => ({
  ensureInstitutionalProfileForRtn: vi.fn(async () => ({ _id: 'profile-1', templates: [] }))
}));

const { extractTransactionsFromPdfBuffer } = vi.hoisted(() => ({
  extractTransactionsFromPdfBuffer: vi.fn(async () => ({
    success: true,
    transactions: [
      { date: '2025-02-01', description: 'Plumber deposit', amount: 100, type: 'credit' }
    ],
    openingBalance: 100,
    closingBalance: 200,
    metadata: { engine: 'pdfplumber' }
  }))
}));

const mockParseStatement = vi.fn(async () => ({
  success: true,
  transactions: [
    { date: '2025-02-01', description: 'Deposit', amount: 100, type: 'credit' }
  ],
  openingBalance: 100,
  closingBalance: 200,
  balances: { opening: 100, closing: 200 },
  metadata: { pageCount: 1, extractionMode: 'digital_pdf', stitcher: { printedSummary: { opening: 100, closing: 200 } } }
}));

vi.mock('../../src/utils/statementParseQuality.js', () => ({
  applyParseQualityPipeline: vi.fn((stmt) => {
    const txns = stmt.transactions || [];
    stmt.parseQuality = 'FAILED_CHECKSUM';
    stmt.checksumRecon = {
      ok: false,
      delta: txns.length > 0 ? '50.0000' : '1',
      deposits: txns.length > 0 ? 100 : 0
    };
    stmt.validationReport = { overallOk: false };
  }),
  attachParseOutcomeFlags: vi.fn((stmt) => {
    stmt.parseOutcome = {
      status: stmt.parseQuality === 'OK' ? 'ok' : 'checksum_failed',
      checksumOk: Boolean(stmt.checksumRecon?.ok),
      parseQuality: stmt.parseQuality,
      txnCount: (stmt.transactions || []).length,
      suggestedHttpStatus: 200
    };
    return stmt.parseOutcome;
  }),
  attachChecksumDeltaProbe: vi.fn(async () => {}),
  buildParseResultForRecon: vi.fn((s) => ({
    transactions: s.transactions,
    openingBalance: s.openingBalance,
    closingBalance: s.closingBalance
  }))
}));

vi.mock('../../src/services/extraction/templateDigitalValidator.js', () => ({
  extractTypeBTextFromBuffer: vi.fn(async () => 'Transaction history\n01/01/2025 dep 100.00'),
  prepareLayoutForDigitalApply: vi.fn((layout) => ({
    layout: { ...layout, layoutAnchorsOnly: true },
    probe: { anchorsOnly: true, mappedCount: 0, anchorStatus: 'ANCHOR_OK' }
  }))
}));

vi.mock('../../src/services/llm/aiLayoutService.js', () => ({
  learnTemplateLayout: vi.fn(async () => ({
    headerAnchors: { tableStart: 'Transactions' },
    columnMapping: { dateCol: 0, descCol: 1, amountCol: 2 }
  })),
  coerceLayoutMapping: vi.fn((m) => m),
  extractTransactionRows: vi.fn(async () => ({
    transactions: [
      { date: '2025-02-01', description: 'Deposit', amount: 100, type: 'credit' }
    ],
    openingBalance: 100,
    closingBalance: 200,
    metadata: { usedVisionRowFallback: true }
  })),
  rowFallbackEnabled: () => true,
  resolveActiveLlm: () => 'gemini',
  resolveLlmApiKey: () => 'test-key'
}));

vi.mock('../../src/services/extraction/pdfPlumberService.js', () => ({
  pdfPlumberEnabled: vi.fn(() => true),
  extractTransactionsFromPdfBuffer
}));

import { clearVisionLayoutCacheForRtn } from '../../src/services/visionLayoutCacheService.js';
import { learnTemplateLayout } from '../../src/services/llm/aiLayoutService.js';
import { extractTransactionsFromPdfBuffer as plumberExtract } from '../../src/services/extraction/pdfPlumberService.js';
import {
  runChecksumGateRecovery,
  computeBatchChecksumStats,
  MACRO_CHECKSUM_MIN_OK_RATIO
} from '../../src/services/batchParseOrchestrator.js';

function failingStmt(name = 'feb.pdf') {
  return {
    fileName: name,
    parseQuality: 'FAILED_CHECKSUM',
    checksumRecon: { ok: false, delta: 50000 },
    checksumDeltaProbe: { probeHint: 'AGGREGATE_MISMATCH' },
    fileBuffer: Buffer.from('%PDF-1.4 mock'),
    bankName: 'Wells Fargo',
    openingBalance: 439.35,
    closingBalance: 1857.38,
    transactions: [{ date: '2025-02-01', description: 'Prior row', amount: 50, type: 'credit' }],
    extractionMode: 'digital_pdf',
    parseResult: {
      rtn: '062000080',
      metadata: { rtn: '062000080', identityMethod: 'RTN_HARD_LOCK', extractionMode: 'digital_pdf' }
    }
  };
}

describe('computeBatchChecksumStats', () => {
  it('computes pass ratio', () => {
    const stats = computeBatchChecksumStats([
      { parseQuality: 'OK' },
      { parseQuality: 'FAILED_CHECKSUM' }
    ]);
    expect(stats.total).toBe(2);
    expect(stats.okCount).toBe(1);
    expect(stats.ratio).toBe(0.5);
    expect(MACRO_CHECKSUM_MIN_OK_RATIO).toBe(0.8);
  });
});

describe('runChecksumGateRecovery', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    mockParseStatement.mockClear();
    const { applyParseQualityPipeline } = await import('../../src/utils/statementParseQuality.js');
    vi.mocked(applyParseQualityPipeline).mockImplementation((stmt) => {
      const txns = stmt.transactions || [];
      stmt.parseQuality = 'FAILED_CHECKSUM';
      stmt.checksumRecon = {
        ok: false,
        delta: txns.length > 0 ? '50.0000' : '1',
        deposits: txns.length > 0 ? 100 : 0
      };
      stmt.validationReport = { overallOk: false };
    });
  });

  it('does not re-teach when layoutByKey was carried from enhance', async () => {
    const layout = { headerAnchors: { tableStart: 'Tx' }, columnMapping: { dateCol: 0, descCol: 1, amountCol: 2 } };
    const layoutByKey = new Map([['rtn:062000080', layout]]);
    const teachDoneByGroup = new Set(['rtn:062000080']);
    const stmts = [failingStmt('feb.pdf')];

    await runChecksumGateRecovery(stmts, {
      identitySources: {},
      parserService: { parseStatement: mockParseStatement },
      finalAnchorData: {},
      teachDoneByGroup,
      layoutByKey
    });

    expect(learnTemplateLayout).not.toHaveBeenCalled();
  });

  it('raises pass ratio via local reparse without second teach', async () => {
    const { applyParseQualityPipeline } = await import('../../src/utils/statementParseQuality.js');
    vi.mocked(applyParseQualityPipeline).mockImplementation((stmt) => {
      const txns = stmt.transactions || [];
      if (txns.length === 0) {
        stmt.parseQuality = 'FAILED_CHECKSUM';
        stmt.checksumRecon = { ok: false, deposits: 0, delta: 1 };
        return;
      }
      stmt.parseQuality = 'OK';
      stmt.checksumRecon = { ok: true, delta: 0, deposits: 100 };
      stmt.validationReport = { overallOk: true };
    });

    const layout = { headerAnchors: { tableStart: 'Tx' } };
    const stmts = [failingStmt('feb.pdf'), failingStmt('dec.pdf')];
    const before = computeBatchChecksumStats(stmts);
    expect(before.ratio).toBeLessThan(MACRO_CHECKSUM_MIN_OK_RATIO);

    const result = await runChecksumGateRecovery(stmts, {
      identitySources: {},
      parserService: { parseStatement: mockParseStatement },
      finalAnchorData: {},
      teachDoneByGroup: new Set(['rtn:062000080']),
      layoutByKey: new Map([['rtn:062000080', layout]])
    });
    const after = computeBatchChecksumStats(stmts);

    expect(learnTemplateLayout).not.toHaveBeenCalled();
    expect(mockParseStatement).toHaveBeenCalled();
    expect(after.ratio).toBeGreaterThanOrEqual(MACRO_CHECKSUM_MIN_OK_RATIO);
    expect(result.succeeded).toBe(true);
  });

  it('escalates to pdfplumber when reparse still fails checksum', async () => {
    const layout = { headerAnchors: { tableStart: 'Tx' } };
    const stmts = [failingStmt('still-fail.pdf')];

    await runChecksumGateRecovery(stmts, {
      identitySources: {},
      parserService: { parseStatement: mockParseStatement },
      finalAnchorData: {},
      teachDoneByGroup: new Set(['rtn:062000080']),
      layoutByKey: new Map([['rtn:062000080', layout]])
    });

    expect(mockParseStatement).toHaveBeenCalled();
    expect(plumberExtract).toHaveBeenCalled();
    expect(stmts[0].parseQuality).toBe('FAILED_CHECKSUM');
  });

  it('returns attempted false when all statements already OK', async () => {
    const result = await runChecksumGateRecovery([{ parseQuality: 'OK', fileName: 'ok.pdf' }], {});
    expect(result.attempted).toBe(false);
    expect(clearVisionLayoutCacheForRtn).not.toHaveBeenCalled();
  });
});
