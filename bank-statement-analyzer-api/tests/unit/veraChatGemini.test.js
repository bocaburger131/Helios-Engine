import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mockGenerateContent = vi.fn();
const mockGetGenerativeModel = vi.fn();

vi.mock('@google/generative-ai', () => ({
  GoogleGenerativeAI: vi.fn().mockImplementation(() => ({
    getGenerativeModel: mockGetGenerativeModel
  }))
}));

vi.mock('../../src/services/geminiVisionService.js', () => ({
  resolveGeminiApiKey: vi.fn(() => 'test-key')
}));

vi.mock('../../src/utils/logger.js', () => ({
  default: { warn: vi.fn(), error: vi.fn(), info: vi.fn() }
}));

describe('chatWithVera / gemini results co-pilot', () => {
  const env = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    mockGenerateContent.mockReset();
    mockGetGenerativeModel.mockReset();
    mockGetGenerativeModel.mockReturnValue({ generateContent: mockGenerateContent });
    process.env = {
      ...env,
      VERA_CHAT_MODEL: 'gemini-2.0-flash',
      VERA_CHAT_GROUNDING: ''
    };
  });

  afterEach(() => {
    process.env = env;
  });

  it('calls Gemini with results-only systemInstruction and no tools by default', async () => {
    mockGenerateContent.mockResolvedValue({
      response: {
        text: () => 'Net cash flow is -$24,194 with NSF count 6.',
        candidates: [{}]
      }
    });

    const { chatWithVera, VERA_SYSTEM_INSTRUCTION } = await import(
      '../../src/services/ai/gemini.js'
    );

    const result = await chatWithVera({
      message: 'What is net cash flow?',
      dealContext: { netCashFlow: -24194, nsfCount: 6 },
      history: [{ role: 'user', content: 'hi' }, { role: 'assistant', content: 'hello' }]
    });

    expect(mockGetGenerativeModel).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'gemini-2.0-flash',
        systemInstruction: VERA_SYSTEM_INSTRUCTION
      })
    );
    expect(mockGetGenerativeModel.mock.calls[0][0].tools).toBeUndefined();
    expect(VERA_SYSTEM_INSTRUCTION).toMatch(/ONLY discuss underwriting RESULTS/i);

    const callArg = mockGenerateContent.mock.calls[0][0];
    const last = callArg.contents[callArg.contents.length - 1];
    expect(last.parts[0].text).toContain('netCashFlow');
    expect(last.parts[0].text).toContain('What is net cash flow?');

    expect(result.answer).toContain('-$24,194');
    expect(result.model).toBe('gemini-2.0-flash');
    expect(result.grounding.used).toBe(false);
  });

  it('tries next model candidate when primary returns 404', async () => {
    mockGenerateContent
      .mockRejectedValueOnce(
        new Error('models/gemini-2.0-flash is not found for API version v1beta')
      )
      .mockResolvedValueOnce({
        response: {
          text: () => 'ADB is $186,214.',
          candidates: [{}]
        }
      });

    const { chatWithVera } = await import('../../src/services/ai/gemini.js');
    const result = await chatWithVera({ message: 'What is ADB?' });

    expect(result.answer).toContain('186,214');
    // After preferred fails, cascade hits gemini-flash-latest next.
    expect(result.model).toBe('gemini-flash-latest');
  });

  it('throws VeraChatConfigError when API key missing', async () => {
    const { resolveGeminiApiKey } = await import('../../src/services/geminiVisionService.js');
    resolveGeminiApiKey.mockReturnValueOnce('');

    const { chatWithVera, VeraChatConfigError } = await import('../../src/services/ai/gemini.js');
    await expect(chatWithVera({ message: 'hi' })).rejects.toBeInstanceOf(VeraChatConfigError);
  });
});
