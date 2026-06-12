import { describe, it, expect } from 'vitest';
import { evaluateJuniorUnderwriter } from '../../src/services/juniorUnderwriterService.js';

describe('juniorUnderwriterService', () => {
  it('returns fiveCs and overallScore', () => {
    const result = evaluateJuniorUnderwriter({
      metrics: { totalDeposits: 100000, netCashFlow: 5000, averageDailyBalance: 12000, nsfCount: 1 },
      alerts: { items: [] }
    });
    expect(result.overallScore).toBeGreaterThan(0);
    expect(result.fiveCs.character.score).toBeDefined();
    expect(result.decision).toBeDefined();
  });

  it('DECLINE when critical alerts', () => {
    const result = evaluateJuniorUnderwriter({
      metrics: { nsfCount: 0 },
      alerts: { items: [{ severity: 'CRITICAL' }] }
    });
    expect(result.decision).toBe('DECLINE');
  });
});
