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

describe('chatWithVera / gemini Vera grounding', () => {
  const env = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    mockGenerateContent.mockReset();
    mockGetGenerativeModel.mockReset();
    mockGetGenerativeModel.mockReturnValue({ generateContent: mockGenerateContent });
    process.env = { ...env, VERA_CHAT_MODEL: 'gemini-2.5-flash' };
  });

  afterEach(() => {
    process.env = env;
  });

  it('calls Gemini with systemInstruction and googleSearch tool', async () => {
    mockGenerateContent.mockResolvedValue({
      response: {
        text: () => 'VERIFIED — Active LLC found on SOS.',
        candidates: [
          {
            groundingMetadata: {
              groundingChunks: [{ web: { title: 'CA SOS', uri: 'https://example.com' } }]
            }
          }
        ]
      }
    });

    const { chatWithVera, VERA_SYSTEM_INSTRUCTION } = await import(
      '../../src/services/ai/gemini.js'
    );

    const result = await chatWithVera({
      message: 'Verify Acme LLC in California',
      dealContext: { companyName: 'Acme LLC' },
      history: [{ role: 'user', content: 'hi' }, { role: 'assistant', content: 'hello' }]
    });

    expect(mockGetGenerativeModel).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'gemini-2.5-flash',
        systemInstruction: VERA_SYSTEM_INSTRUCTION,
        tools: [{ googleSearch: {} }]
      })
    );

    const callArg = mockGenerateContent.mock.calls[0][0];
    expect(callArg.contents.length).toBeGreaterThanOrEqual(2);
    const last = callArg.contents[callArg.contents.length - 1];
    expect(last.parts[0].text).toContain('Acme LLC');
    expect(last.parts[0].text).toContain('Verify Acme LLC');

    expect(result.answer).toContain('VERIFIED');
    expect(result.model).toBe('gemini-2.5-flash');
    expect(result.grounding.used).toBe(true);
    expect(result.grounding.sources[0].uri).toBe('https://example.com');
  });

  it('falls back to gemini-1.5-pro + googleSearchRetrieval when primary fails', async () => {
    mockGenerateContent
      .mockRejectedValueOnce(new Error('Unknown field googleSearch'))
      .mockResolvedValueOnce({
        response: {
          text: () => 'NOT FOUND — no registry hit',
          candidates: [{}]
        }
      });

    const { chatWithVera } = await import('../../src/services/ai/gemini.js');
    const result = await chatWithVera({ message: 'Check address 1 Main St' });

    expect(result.model).toBe('gemini-1.5-pro');
    expect(mockGetGenerativeModel).toHaveBeenLastCalledWith(
      expect.objectContaining({
        model: 'gemini-1.5-pro',
        tools: [{ googleSearchRetrieval: {} }]
      })
    );
  });

  it('throws VeraChatConfigError when API key missing', async () => {
    const { resolveGeminiApiKey } = await import('../../src/services/geminiVisionService.js');
    resolveGeminiApiKey.mockReturnValueOnce('');

    const { chatWithVera, VeraChatConfigError } = await import('../../src/services/ai/gemini.js');
    await expect(chatWithVera({ message: 'hi' })).rejects.toBeInstanceOf(VeraChatConfigError);
  });
});
