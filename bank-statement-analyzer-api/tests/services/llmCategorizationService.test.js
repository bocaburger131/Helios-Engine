import { describe, it, expect, beforeEach, vi } from 'vitest';
import { LLMCategorizationService } from '../../src/services/llmCategorizationService.js';

describe('LLMCategorizationService', () => {
  let llmService;

  beforeEach(() => {
    llmService = new LLMCategorizationService();
  });

  describe('Transaction Categorization', () => {
    it('should categorize a grocery store transaction', async () => {
      const result = await llmService.categorizeTransaction({
        description: 'WALMART SUPERCENTER GROCERY',
        amount: -50
      });

      expect(result).toMatchObject({
        category: 'Groceries',
        confidence: expect.any(Number),
        method: expect.stringMatching(/rule_based|exact_merchant_match|ensemble/),
        alternativeCategories: expect.any(Array),
        details: {
          patternScore: expect.any(Number),
          ruleScore: expect.any(Number)
        },
        fingerprint: expect.any(String)
      });
    });

    it('should categorize a restaurant transaction', async () => {
      const result = await llmService.categorizeTransaction({
        description: 'MCDONALDS RESTAURANT',
        amount: -15
      });

      expect(result).toMatchObject({
        category: 'Dining',
        confidence: expect.any(Number),
        method: expect.stringMatching(/rule_based|exact_merchant_match|ensemble/),
        alternativeCategories: expect.any(Array),
        details: {
          patternScore: expect.any(Number),
          ruleScore: expect.any(Number)
        },
        fingerprint: expect.any(String)
      });
    });

    it('should categorize a transportation transaction', async () => {
      const result = await llmService.categorizeTransaction({
        description: 'UBER TRIP 123',
        amount: -25
      });

      expect(result).toMatchObject({
        category: 'Transportation',
        confidence: expect.any(Number),
        method: expect.stringMatching(/rule_based|exact_merchant_match|ensemble/),
        alternativeCategories: expect.any(Array),
        details: {
          patternScore: expect.any(Number),
          ruleScore: expect.any(Number)
        },
        fingerprint: expect.any(String)
      });
    });

    it('should handle errors gracefully', async () => {
      const result = await llmService.categorizeTransaction({
        description: null,
        amount: -100
      });

      expect(result).toMatchObject({
        category: 'Other',
        confidence: expect.any(Number),
        method: 'error_fallback',
        reasoning: expect.any(String),
        error: expect.any(String)
      });
    });
  });

  describe('Pattern Matching', () => {
    it('should learn from and match similar transactions', async () => {
      // Train the service with a transaction
      await llmService.learnFromTransaction({
        description: 'MCDONALDS #123',
        amount: -15
      }, 'Dining', 0.95);

      // Categorize a similar transaction
      const result = await llmService.categorizeTransaction({
        description: 'MCDONALDS #456',
        amount: -12
      });

      expect(result.category).toBe('Dining');
      expect(result.confidence).toBeGreaterThan(0.6);
    });
  });

  describe('Category Confidence Levels', () => {
    it('should handle income transactions with high confidence', async () => {
      const result = await llmService.categorizeTransaction({
        description: 'PAYROLL DEPOSIT EMPLOYER123',
        amount: 5000
      });

      expect(result.category).toBe('Income');
      expect(result.confidence).toBeGreaterThan(0.6);
    });

    it('should handle shopping transactions with medium confidence', async () => {
      const result = await llmService.categorizeTransaction({
        description: 'AMAZON.COM PURCHASE',
        amount: -150
      });

      expect(result.category).toBe('Shopping');
      expect(result.confidence).toBeGreaterThan(0.4);
    });

    it('should handle ambiguous transactions with low confidence', async () => {
      const result = await llmService.categorizeTransaction({
        description: 'MISC PAYMENT XYZ',
        amount: -45
      });

      expect(result.confidence).toBeLessThan(0.7);
    });
  });
});
