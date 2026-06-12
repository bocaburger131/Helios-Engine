import { describe, it, expect, beforeEach } from 'vitest';
import { LLMCategorizationService } from '../../src/services/llmCategorizationService.js';

describe('batch merchant memory', () => {
  let service;

  beforeEach(() => {
    service = new LLMCategorizationService();
  });

  it('reuses category for same merchant fingerprint within one categorizeTransactions pass', async () => {
    const txns = [
      { description: 'ROGUE FITNESS WHOLESALE 1001', amount: -500, date: '2024-03-01' },
      { description: 'ROGUE FITNESS WHOLESALE 2002', amount: -600, date: '2024-10-01' }
    ];

    const result = await service.categorizeTransactions(txns, {
      uploadSessionId: 'test-session-1',
      enableLLM: false,
      fallbackToRules: true,
      batchSize: 10
    });

    expect(result.categorizedTransactions.length).toBe(2);
    const methods = result.categorizedTransactions.map((t) => t.method);
    expect(methods[0]).not.toBe('batch_merchant_memory');
    expect(methods[1]).toBe('batch_merchant_memory');
    expect(result.categorizedTransactions[0].category).toBe(
      result.categorizedTransactions[1].category
    );
  });

  it('aligns fingerprints after stripping digits and bank noise tokens', () => {
    const a = service.generateFingerprint('POS DEBIT SQUARE 1111');
    const b = service.generateFingerprint('ACH PAYMENT SQUARE 2222');
    expect(a).toBe(b);
  });
});
