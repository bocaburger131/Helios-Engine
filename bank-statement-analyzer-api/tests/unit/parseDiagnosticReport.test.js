import { describe, it, expect } from 'vitest';
import { dedupeExactFingerprints, buildParseDiagnosticReport } from '../../src/utils/parseDiagnosticReport.js';

describe('parseDiagnosticReport', () => {
  it('dedupes exact duplicate fingerprints', () => {
    const rows = [
      { date: '2024-01-01', amount: 100, description: 'Deposit A' },
      { date: '2024-01-01', amount: 100, description: 'Deposit A' },
      { date: '2024-01-02', amount: -50, description: 'Fee' }
    ];
    const out = dedupeExactFingerprints(rows);
    expect(out).toHaveLength(2);
  });

  it('builds four-stage diagnostic report', () => {
    const report = buildParseDiagnosticReport({
      fileName: 'test.pdf',
      rawRows: [{ date: '2024-01-01', amount: 100, description: 'Dep' }],
      afterSanitize: [{ date: '2024-01-01', amount: 100, description: 'Dep' }],
      afterHints: [{ date: '2024-01-01', amount: 100, description: 'Dep', type: 'credit' }],
      checksumRecon: { ok: true, opening: 1000, closing: 1100, deposits: 100, withdrawals: 0 }
    });
    expect(report.stages.raw.count).toBe(1);
    expect(report.checksum.ok).toBe(true);
  });
});
