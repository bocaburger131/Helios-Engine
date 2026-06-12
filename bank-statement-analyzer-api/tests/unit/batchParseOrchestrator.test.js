import { describe, it, expect, vi, beforeEach } from 'vitest';

const { shouldRejectStoredMongoTemplate, extractTransactionsFromPdfBuffer } = vi.hoisted(() => ({
  shouldRejectStoredMongoTemplate: vi.fn(() => ({
    reject: true,
    reason: 'column_mapped_zero',
    anchor: { status: 'ANCHOR_OK', misses: [] },
    probe: { mappedCount: 0, anchorsOnly: true }
  })),
  extractTransactionsFromPdfBuffer: vi.fn(async () => ({
    success: true,
    transactions: [
      { date: '2025-01-15', description: 'Plumber deposit', amount: 500, type: 'credit' }
    ],
    openingBalance: 1000,
    closingBalance: 1500,
    metadata: { engine: 'pdfplumber' }
  }))
}));

vi.mock('../../src/services/visionLayoutCacheService.js', () => ({
  clearVisionLayoutCacheForRtn: vi.fn(async () => ({ deleted: 0, keys: [] }))
}));

vi.mock('../../src/services/institutionalTemplatePersist.js', () => ({
  persistLearningTemplate: vi.fn(async () => ({ version: 1, status: 'LEARNING' })),
  getLatestLearnableTemplate: vi.fn(() => null)
}));

vi.mock('../../src/services/bankEnrichmentService.js', () => ({
  ensureInstitutionalProfileForRtn: vi.fn(async () => ({ _id: 'p1', templates: [] }))
}));

const mockParseStatement = vi.fn(async () => ({
  success: true,
  transactions: [{ date: '2025-01-15', description: 'Deposit', amount: 80000, type: 'credit' }],
  openingBalance: 1000,
  closingBalance: 1200,
  metadata: { pageCount: 1 }
}));

vi.mock('../../src/utils/statementParseQuality.js', () => ({
  applyParseQualityPipeline: vi.fn((stmt) => {
    if (stmt.parseResult?.metadata?.usedPdfPlumber) {
      stmt.parseQuality = 'OK';
      stmt.checksumRecon = { ok: true, delta: 0 };
    } else {
      stmt.parseQuality = 'FAILED_CHECKSUM';
      stmt.checksumRecon = { ok: false, deposits: 67000 };
      stmt.checksumDeltaProbe = { probeHint: 'AGGREGATE_MISMATCH' };
    }
  }),
  attachParseOutcomeFlags: vi.fn(),
  attachChecksumDeltaProbe: vi.fn(async (stmt) => {
    if (!stmt.checksumDeltaProbe) {
      stmt.checksumDeltaProbe = { probeHint: 'AGGREGATE_MISMATCH' };
    }
  })
}));

vi.mock('../../src/services/llm/aiLayoutService.js', () => ({
  resolveLlmApiKey: vi.fn(() => 'test-key'),
  resolveActiveLlm: vi.fn(() => 'gemini'),
  learnTemplateLayout: vi.fn(async () => ({
    headerAnchors: { tableStart: 'Transaction history' },
    columnMapping: { dateCol: 0, descCol: 1, amountCol: 2 }
  })),
  coerceLayoutMapping: vi.fn((m) => m),
  extractTransactionRows: vi.fn(),
  rowFallbackEnabled: vi.fn(() => false)
}));

import {
  enhanceBatchParsesWithTeacher,
  hasChecksumBleed,
  batchUseVisionRowFallback,
  detectProgrammaticAnomalies
} from '../../src/services/batchParseOrchestrator.js';
import { learnTemplateLayout, extractTransactionRows } from '../../src/services/llm/aiLayoutService.js';
import { getLatestLearnableTemplate } from '../../src/services/institutionalTemplatePersist.js';

vi.mock('../../src/services/extraction/templateDigitalValidator.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    shouldRejectStoredMongoTemplate,
    extractTypeBTextFromBuffer: vi.fn(async () => 'Transaction history\n01/01/2025 dep 100.00'),
    prepareLayoutForDigitalApply: vi.fn((layout) => ({
      layout: { ...layout, layoutAnchorsOnly: true },
      probe: { anchorsOnly: true, mappedCount: 0, anchorStatus: 'ANCHOR_OK' }
    }))
  };
});

vi.mock('../../src/services/extraction/pdfPlumberService.js', () => ({
  pdfPlumberEnabled: vi.fn(() => true),
  extractTransactionsFromPdfBuffer
}));

describe('enhanceBatchParsesWithTeacher', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('preserves the same parsedStatements array reference and length', async () => {
    const parsedStatements = [
      {
        fileName: 'BANK STMT APR - 9470.pdf',
        bankName: 'Regions Bank',
        openingBalance: 15090.51,
        closingBalance: 10040.61,
        transactions: [{ date: '2024-04-01', description: 'POS DEBIT', amount: 50, type: 'credit' }],
        parseQuality: 'FAILED_CHECKSUM',
        checksumRecon: { ok: false, delta: '100.0000' },
        parseSanityStats: { inputCount: 1, acceptedCount: 1 },
        parseResult: { bankName: 'Regions Bank' },
        fileBuffer: null
      }
    ];

    const inputRef = parsedStatements;
    const result = await enhanceBatchParsesWithTeacher(parsedStatements, {
      identitySources: { businessAddress: 'Ocean Springs, MS' }
    });

    expect(result.parsedStatements).toBe(inputRef);
    expect(parsedStatements.length).toBe(1);
  });

  it('uses pdfplumber before Gemini when re-parse still fails checksum', async () => {
    process.env.BATCH_USE_VISION_ROW_FALLBACK = 'false';
    const buf = Buffer.from('%PDF-1.4');
    const parsedStatements = [
      {
        fileName: 'dec.pdf',
        bankName: 'Wells Fargo',
        openingBalance: 408.69,
        closingBalance: 2507.76,
        transactions: [{ date: '2025-12-01', description: 'bleed', amount: 9999, type: 'credit' }],
        parseQuality: 'FAILED_CHECKSUM',
        checksumRecon: { ok: false, deposits: 67000 },
        checksumDeltaProbe: { probeHint: 'AGGREGATE_MISMATCH' },
        stitcher: { typeA: { printed: { totalDeposits: 29173.53 } } },
        parseResult: {
          bankName: 'Wells Fargo',
          rtn: '062000080',
          metadata: { extractionMode: 'digital_pdf' }
        },
        extractionMode: 'digital_pdf',
        fileBuffer: buf
      }
    ];

    await enhanceBatchParsesWithTeacher(parsedStatements, {
      identitySources: {},
      parserService: { parseStatement: mockParseStatement }
    });

    expect(extractTransactionsFromPdfBuffer).toHaveBeenCalled();
    expect(extractTransactionRows).not.toHaveBeenCalled();
    expect(parsedStatements[0].parseQuality).toBe('OK');
  });

  it('uses one layout teach + local reparse instead of per-file vision rows', async () => {
    process.env.BATCH_USE_VISION_ROW_FALLBACK = 'false';
    const buf = Buffer.from('%PDF-1.4');
    const parsedStatements = [
      {
        fileName: 'jan.pdf',
        bankName: 'Wells Fargo',
        openingBalance: 1000,
        closingBalance: 1100,
        transactions: [{ date: '2025-01-01', description: 'x', amount: 1, type: 'credit' }],
        parseQuality: 'FAILED_CHECKSUM',
        checksumRecon: { ok: false, delta: '50000' },
        checksumDeltaProbe: { probeHint: 'AGGREGATE_MISMATCH' },
        stitcher: { typeA: { printed: { totalDeposits: 50000 } } },
        parseSanityStats: { inputCount: 1, acceptedCount: 1 },
        parseResult: {
          bankName: 'Wells Fargo',
          rtn: '062000080',
          metadata: { extractionMode: 'digital_pdf' }
        },
        extractionMode: 'digital_pdf',
        fileBuffer: buf
      }
    ];

    await enhanceBatchParsesWithTeacher(parsedStatements, {
      identitySources: {},
      parserService: { parseStatement: mockParseStatement }
    });

    expect(learnTemplateLayout).toHaveBeenCalledTimes(1);
    expect(mockParseStatement).toHaveBeenCalled();
    expect(extractTransactionsFromPdfBuffer).toHaveBeenCalled();
    expect(extractTransactionRows).not.toHaveBeenCalled();
    expect(parsedStatements[0].parseQuality).toBe('OK');
  });

  it('hasChecksumBleed detects deposit drift vs printed summary', () => {
    const stmt = {
      checksumDeltaProbe: { probeHint: 'AGGREGATE_MISMATCH' },
      checksumRecon: { ok: false, deposits: 67000 },
      stitcher: { typeA: { printed: { totalDeposits: 28007.36 } } },
      transactions: [{ amount: 100, type: 'credit' }]
    };
    expect(hasChecksumBleed(stmt)).toBe(true);
  });

  it('batchUseVisionRowFallback defaults true unless explicitly false', () => {
    const prev = process.env.BATCH_USE_VISION_ROW_FALLBACK;
    delete process.env.BATCH_USE_VISION_ROW_FALLBACK;
    expect(batchUseVisionRowFallback()).toBe(true);
    process.env.BATCH_USE_VISION_ROW_FALLBACK = 'false';
    expect(batchUseVisionRowFallback()).toBe(false);
    if (prev !== undefined) process.env.BATCH_USE_VISION_ROW_FALLBACK = prev;
    else delete process.env.BATCH_USE_VISION_ROW_FALLBACK;
  });

  it('forces fresh teach when Mongo LEARNING is rejected by shouldRejectStoredMongoTemplate', async () => {
    getLatestLearnableTemplate.mockReturnValueOnce({
      mapping: {
        headerAnchors: { tableStart: 'Stale anchor' },
        columnMapping: { dateCol: 0, descCol: 1, amountCol: 2 }
      }
    });

    const buf = Buffer.from('%PDF-1.4');
    const parsedStatements = [
      {
        fileName: 'feb.pdf',
        bankName: 'Wells Fargo',
        openingBalance: 1000,
        closingBalance: 1100,
        transactions: [{ date: '2025-02-01', description: 'x', amount: 1, type: 'credit' }],
        parseQuality: 'FAILED_CHECKSUM',
        checksumRecon: { ok: false },
        parseResult: {
          bankName: 'Wells Fargo',
          rtn: '062000080',
          metadata: { extractionMode: 'digital_pdf' }
        },
        extractionMode: 'digital_pdf',
        fileBuffer: buf
      }
    ];

    await enhanceBatchParsesWithTeacher(parsedStatements, {
      identitySources: {},
      parserService: { parseStatement: mockParseStatement }
    });

    expect(shouldRejectStoredMongoTemplate).toHaveBeenCalled();
    expect(learnTemplateLayout).toHaveBeenCalled();
  });
});

describe('detectProgrammaticAnomalies', () => {
  it('detects MISALIGNED_COLUMNS when parsed deposits far exceed printed', () => {
    const stmt = {
      fileName: 'jan.pdf',
      checksumDeltaProbe: {
        reconciliationBreakdown: { deposits: 42792.54, withdrawals: 23741.11 }
      },
      stitcher: { typeA: { printed: { totalDeposits: 20763.32, totalWithdrawals: 22831.73 } } }
    };
    const diag = detectProgrammaticAnomalies(stmt);
    expect(diag?.diagnosis).toBe('MISALIGNED_COLUMNS');
    expect(diag?.confidenceScore).toBeGreaterThan(0.8);
  });

  it('detects COLUMN_FLIP when parsed deposits match printed withdrawals', () => {
    const stmt = {
      checksumDeltaProbe: {
        reconciliationBreakdown: { deposits: 22831.73, withdrawals: 20763.32 }
      },
      stitcher: { typeA: { printed: { totalDeposits: 20763.32, totalWithdrawals: 22831.73 } } }
    };
    const diag = detectProgrammaticAnomalies(stmt);
    expect(diag?.diagnosis).toBe('COLUMN_FLIP');
  });
});
