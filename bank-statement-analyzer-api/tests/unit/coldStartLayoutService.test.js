import { describe, it, expect } from 'vitest';
import { enrichMappingWithReconciliationSpec } from '../../src/services/coldStartLayoutService.js';
import { buildReconciliationSpecFromSummaryLabels } from '../../src/services/extraction/reconciliationSpec.js';

describe('coldStartLayoutService', () => {
  it('enrichMappingWithReconciliationSpec builds spec from summaryLineLabels', () => {
    const mapping = enrichMappingWithReconciliationSpec({
      headerAnchors: { tableStart: 'Activity', tableEnd: 'Summary' },
      summaryLineLabels: [
        { key: 'deposits', label: 'Total Deposits', role: 'credit' },
        { key: 'withdrawals', label: 'Total Withdrawals', role: 'debit' }
      ]
    });

    expect(mapping.reconciliationSpec?.summaryLines).toHaveLength(2);
    expect(mapping.reconciliationSpec.summaryLines[0].role).toBe('credit');
  });

  it('buildReconciliationSpecFromSummaryLabels ignores invalid roles', () => {
    const spec = buildReconciliationSpecFromSummaryLabels([
      { key: 'x', label: 'Foo', role: 'invalid' },
      { key: 'deposits', label: 'Deposits', role: 'credit' }
    ]);
    expect(spec?.summaryLines).toHaveLength(1);
  });
});
