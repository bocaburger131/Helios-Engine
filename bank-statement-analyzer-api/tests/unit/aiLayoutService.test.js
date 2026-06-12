import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('aiLayoutService', () => {
  const orig = process.env.ACTIVE_LLM;

  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    if (orig === undefined) delete process.env.ACTIVE_LLM;
    else process.env.ACTIVE_LLM = orig;
  });

  it('defaults ACTIVE_LLM to gemini', async () => {
    delete process.env.ACTIVE_LLM;
    const { resolveActiveLlm, getActiveAdapter } = await import(
      '../../src/services/llm/aiLayoutService.js'
    );
    expect(resolveActiveLlm()).toBe('gemini');
    expect(getActiveAdapter().getName()).toBe('gemini');
  });

  it('selects perplexity adapter when ACTIVE_LLM=perplexity', async () => {
    process.env.ACTIVE_LLM = 'perplexity';
    const { getActiveAdapter } = await import('../../src/services/llm/aiLayoutService.js');
    expect(getActiveAdapter().getName()).toBe('perplexity');
  });
});
