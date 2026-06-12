import { describe, it, expect } from 'vitest';
import { generateVeraBriefingDeterministic } from '../../src/services/veraBriefingService.js';

describe('veraBriefingService deterministic', () => {
  it('DECLINE without LLM when CRITICAL alerts present', () => {
    const result = generateVeraBriefingDeterministic({
      applicationData: { companyName: 'Test Co' },
      alerts: [{ severity: 'CRITICAL', title: 'Fraud signal', message: 'Synthetic deposits' }],
      macroResult: { financialTotals: { nsfCount: 0 } }
    });
    expect(result.decision).toBe('DECLINE');
    expect(result.briefingMarkdown).toContain('DECLINE');
    expect(result.bankabilityScore).toBeLessThanOrEqual(3);
  });

  it('STIPULATE when NSF elevated', () => {
    const result = generateVeraBriefingDeterministic({
      applicationData: { companyName: 'Test Co' },
      alerts: [],
      macroResult: { financialTotals: { nsfCount: 5, netCashFlow: 1000 } },
      juniorUnderwriter: { overallScore: 70, decision: 'ADEQUATE' }
    });
    expect(result.decision).toBe('STIPULATE');
    expect(result.stipulations.length).toBeGreaterThan(0);
  });
});
