import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { mockGenerateContent } = vi.hoisted(() => ({
  mockGenerateContent: vi.fn()
}));

vi.mock('@google/generative-ai', () => ({
  GoogleGenerativeAI: class {
    getGenerativeModel() {
      return { generateContent: mockGenerateContent };
    }
  }
}));

vi.mock('../utils/structuredLog.js', () => ({
  logStructured: vi.fn()
}));

import {
  stripMarkdownFences,
  extractJsonObject,
  prenormalizeVisionPayload,
  coerceLayoutMapping,
  analyzeStatementLayout,
  resolveGeminiApiKey,
  resolveGeminiVisionModel
} from '../../src/services/geminiVisionService.js';

const validVisionJson = {
  layoutName: 'TestBank_Checking_v1',
  headerAnchors: { start: 'Transaction Details', end: 'Daily Balance' },
  columnMapping: { dateIdx: 0, descIdx: 1, amountIdx: 2, balanceIdx: 3 },
  mathPattern: 'MINUS_PREFIX',
  confidenceScore: 0.91,
  vitals: { currency: 'USD', dateFormat: 'MM/DD/YYYY' }
};

const MINIMAL_PDF = Buffer.from(
  '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n' +
    '2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n' +
    '3 0 obj<</Type/Page/MediaBox[0 0 612 792]/Parent 2 0 R>>endobj\n' +
    'xref\n0 4\n0000000000 65535 f\n0000000009 00000 n\n0000000058 00000 n\n0000000115 00000 n\n' +
    'trailer<</Size 4/Root 1 0 R>>\nstartxref\n190\n%%EOF\n'
);

describe('geminiVisionService helpers', () => {
  it('stripMarkdownFences removes json code fence', () => {
    const s = '```json\n{"a":1}\n```';
    expect(stripMarkdownFences(s)).toBe('{"a":1}');
  });

  it('extractJsonObject parses fenced JSON', () => {
    const o = extractJsonObject('```\n{"x":2}\n```');
    expect(o).toEqual({ x: 2 });
  });

  it('prenormalizeVisionPayload maps Idx and start/end to runner keys', () => {
    const pre = prenormalizeVisionPayload(validVisionJson);
    expect(pre.headerAnchors.tableStart).toBe('Transaction Details');
    expect(pre.headerAnchors.tableEnd).toBe('Daily Balance');
    expect(pre.columnMapping.dateCol).toBe(0);
    expect(pre.columnMapping.balanceCol).toBe(3);
    expect(pre.confidence).toBe(0.91);
  });

  it('coerceLayoutMapping accepts runner-shaped prenormalized payload', () => {
    const pre = prenormalizeVisionPayload(validVisionJson);
    const { _layoutName, _vitals, ...forCoerce } = pre;
    const core = coerceLayoutMapping(forCoerce);
    expect(core.mathPattern).toBe('MINUS_PREFIX');
    expect(core.layoutConfidence).toBe(0.91);
    expect(_layoutName).toBe('TestBank_Checking_v1');
  });
});

describe('resolveGeminiApiKey', () => {
  afterEach(() => {
    delete process.env.GEMINI_API_KEY;
    delete process.env.GOOGLE_API_KEY;
  });

  it('prefers GEMINI_API_KEY then GOOGLE_API_KEY', () => {
    delete process.env.GEMINI_API_KEY;
    process.env.GOOGLE_API_KEY = 'from-google';
    expect(resolveGeminiApiKey()).toBe('from-google');
    process.env.GEMINI_API_KEY = 'from-gemini';
    expect(resolveGeminiApiKey()).toBe('from-gemini');
  });
});

describe('resolveGeminiVisionModel', () => {
  afterEach(() => {
    delete process.env.GEMINI_VISION_MODEL;
  });

  it('defaults to gemini-flash-latest', () => {
    expect(resolveGeminiVisionModel()).toBe('gemini-flash-latest');
  });

  it('honors GEMINI_VISION_MODEL', () => {
    process.env.GEMINI_VISION_MODEL = 'gemini-2.5-flash';
    expect(resolveGeminiVisionModel()).toBe('gemini-2.5-flash');
  });
});

describe('analyzeStatementLayout', () => {
  beforeEach(() => {
    process.env.GEMINI_API_KEY = 'test-key';
    mockGenerateContent.mockReset();
  });

  afterEach(() => {
    delete process.env.GEMINI_API_KEY;
  });

  it('returns normalized mapping when Gemini returns valid vision JSON', async () => {
    mockGenerateContent.mockResolvedValue({
      response: { text: () => JSON.stringify(validVisionJson) }
    });
    const out = await analyzeStatementLayout(MINIMAL_PDF, {
      rtn: '021000021',
      statementId: 's1',
      jobId: 'j1'
    });
    expect(out.headerAnchors.tableStart).toBe('Transaction Details');
    expect(out.layoutConfidence).toBe(0.91);
    expect(out.layoutName).toBe('TestBank_Checking_v1');
    expect(out.vitals.currency).toBe('USD');
    expect(mockGenerateContent).toHaveBeenCalledTimes(1);
  });

  it('retries once when first response is not JSON and second is valid', async () => {
    mockGenerateContent
      .mockResolvedValueOnce({ response: { text: () => 'not json at all' } })
      .mockResolvedValueOnce({
        response: { text: () => JSON.stringify(validVisionJson) }
      });
    // Use a distinct RTN so Redis layout cache from the prior test does not short-circuit Gemini.
    const out = await analyzeStatementLayout(MINIMAL_PDF, { rtn: '021000022' });
    expect(mockGenerateContent).toHaveBeenCalledTimes(2);
    expect(out.columnMapping.dateCol).toBe(0);
  });
});
