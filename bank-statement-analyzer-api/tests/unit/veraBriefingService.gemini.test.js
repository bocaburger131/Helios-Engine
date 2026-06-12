import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mockGenerateContent = vi.fn();

vi.mock('@google/generative-ai', () => ({
  GoogleGenerativeAI: vi.fn().mockImplementation(() => ({
    getGenerativeModel: vi.fn().mockReturnValue({
      generateContent: mockGenerateContent
    })
  })),
  SchemaType: {
    OBJECT: 'OBJECT',
    STRING: 'STRING',
    NUMBER: 'NUMBER',
    ARRAY: 'ARRAY'
  }
}));

vi.mock('../../src/services/geminiVisionService.js', () => ({
  resolveGeminiApiKey: () => 'test-key',
  extractJsonObject: (raw) => {
    if (typeof raw === 'object') return raw;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }
}));

describe('veraBriefingService Gemini v2', () => {
  const env = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    mockGenerateContent.mockReset();
    process.env = { ...env, USE_VERA_BRIEFING_V2: 'true', USE_MOCK_SERVICES: 'false' };
  });

  afterEach(() => {
    process.env = env;
  });

  it('returns DECLINE on CRITICAL without calling Gemini', async () => {
    const { generateVeraBriefing, generateVeraBriefingWithGemini } = await import(
      '../../src/services/veraBriefingService.js'
    );

    const result = await generateVeraBriefing({
      applicationData: { companyName: 'Acme LLC' },
      alerts: [{ severity: 'CRITICAL', title: 'Fraud', message: 'Synthetic deposits' }],
      macroResult: {}
    });

    expect(result.decision).toBe('DECLINE');
    expect(mockGenerateContent).not.toHaveBeenCalled();
    await expect(
      generateVeraBriefingWithGemini({
        alerts: [{ severity: 'CRITICAL' }],
        macroResult: {}
      })
    ).resolves.toMatchObject({ decision: 'DECLINE' });
  });

  it('calls Gemini and normalizes structured response', async () => {
    mockGenerateContent.mockResolvedValue({
      response: {
        text: () =>
          JSON.stringify({
            decision: 'STIPULATE',
            bankabilityScore: 7.2,
            stipulations: [{ id: 's1', title: 'Provide 3 months statements', reason: 'Gap' }],
            briefingMarkdown:
              '# Executive Underwriting Briefing\n\n**Decision:** STIPULATE\n\n## Single Biggest Strength\n\nStrong ADB.\n'
          })
      }
    });

    const { generateVeraBriefingWithGemini } = await import('../../src/services/veraBriefingService.js');

    const result = await generateVeraBriefingWithGemini({
      applicationData: { companyName: 'Demo LLC', requestedLoanAmount: 50000 },
      alerts: [],
      juniorUnderwriter: { overallScore: 72, decision: 'ADEQUATE', fiveCs: {} },
      macroResult: {
        metrics: { totalDeposits: 100000, nsfCount: 2 },
        accountingSummary: { revenue: { total: 120000 } }
      }
    });

    expect(mockGenerateContent).toHaveBeenCalledTimes(1);
    expect(result.decision).toBe('STIPULATE');
    expect(result.bankabilityScore).toBe(7.2);
    expect(result.briefingMarkdown).toContain('Executive Underwriting Briefing');
    expect(result.metadata.source).toContain('gemini');
  });
});
