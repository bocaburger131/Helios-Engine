import { describe, it, expect } from 'vitest';
import { buildAnalysisListFields, buildMonthsAnalyzedMeta } from '../../src/utils/analysisListMeta.js';

describe('analysisListMeta', () => {
  it('builds chronological month label', () => {
    const meta = buildMonthsAnalyzedMeta([
      { coveragePeriod: { startDate: '2024-02-01' }, fileName: 'feb.pdf' },
      { coveragePeriod: { startDate: '2023-12-01' }, fileName: 'dec.pdf' },
      { coveragePeriod: { startDate: '2024-08-01' }, fileName: 'aug.pdf' }
    ]);
    expect(meta.monthsAnalyzed[0]).toBe('2023-12');
    expect(meta.monthsAnalyzedLabel).toContain('Dec 2023');
    expect(meta.monthsAnalyzedLabel).toContain('Aug 2024');
  });

  it('prefers applicationContext company name', () => {
    const fields = buildAnalysisListFields(
      {
        applicationContext: { companyName: 'Premier Fitness, LLC' },
        processedDate: '2026-05-20T07:00:00.000Z'
      },
      { monthlyStatementSummaries: [{ coveragePeriod: { startDate: '2024-01-01' } }] }
    );
    expect(fields.analysisTitle).toBe('Premier Fitness, LLC');
    expect(fields.analyzedAt).toBeTruthy();
  });
});
