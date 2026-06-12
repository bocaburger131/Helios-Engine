import { describe, it, expect } from 'vitest';
import {
  validateAnchorsOnTypeBText,
  applyAnchorsToTypeBText,
  calibrateColumnMapping,
  probeMappedRowCount,
  shouldUseAnchorsOnly,
  prepareLayoutForDigitalApply,
  toAnchorsOnlyLayout,
  shouldRejectStoredMongoTemplate,
  probeLayoutOnDigitalText
} from '../../src/services/extraction/templateDigitalValidator.js';

const WELLS_TYPE_B = `
Wells Fargo Initiate Business Checking
Transaction history
Date    Description                    Deposits    Withdrawals
01/15/2025  ACH DEPOSIT PAYROLL          1,500.00
01/16/2025  CHECK 1042                                  250.00
Deposits/Credits 28,007.36
Withdrawals/Debits 12,400.00
Ending balance 45,000.00
`.trim();

const WELLS_LAYOUT = {
  headerAnchors: { tableStart: 'Transaction history', tableEnd: 'Deposits/Credits' },
  columnMapping: { dateCol: 0, descCol: 1, amountCol: 3, balanceCol: null },
  mathPattern: 'MINUS_PREFIX'
};

describe('templateDigitalValidator', () => {
  it('validateAnchorsOnTypeBText hits Wells tableStart', () => {
    const r = validateAnchorsOnTypeBText(WELLS_LAYOUT, WELLS_TYPE_B);
    expect(r.ok).toBe(true);
    expect(r.misses).toHaveLength(0);
    expect(r.status).toBe('ANCHOR_OK');
  });

  it('validateAnchorsOnTypeBText misses stale anchor', () => {
    const stale = { headerAnchors: { tableStart: 'Nonexistent ledger block' } };
    const r = validateAnchorsOnTypeBText(stale, WELLS_TYPE_B);
    expect(r.ok).toBe(false);
    expect(r.status).toBe('ANCHOR_MISS');
  });

  it('applyAnchorsToTypeBText slices to activity region', () => {
    const sliced = applyAnchorsToTypeBText(WELLS_TYPE_B, WELLS_LAYOUT);
    expect(sliced).toContain('Transaction history');
    expect(sliced).not.toContain('Wells Fargo Initiate');
  });

  it('probeMappedRowCount is 0 when column indices wrong', () => {
    const sliced = applyAnchorsToTypeBText(WELLS_TYPE_B, WELLS_LAYOUT);
    const count = probeMappedRowCount(WELLS_LAYOUT, sliced);
    expect(count).toBe(0);
  });

  it('shouldUseAnchorsOnly when mappedCount below threshold', () => {
    expect(shouldUseAnchorsOnly({ anchorOk: true, mappedCount: 0 })).toBe(true);
    expect(shouldUseAnchorsOnly({ anchorOk: true, mappedCount: 50 })).toBe(false);
  });

  it('prepareLayoutForDigitalApply drops columnMapping for Wells-like text', () => {
    const { layout, probe } = prepareLayoutForDigitalApply(WELLS_LAYOUT, WELLS_TYPE_B);
    expect(probe.anchorsOnly).toBe(true);
    expect(layout.columnMapping).toBeUndefined();
    expect(layout.layoutAnchorsOnly).toBe(true);
  });

  it('toAnchorsOnlyLayout strips column fields', () => {
    const out = toAnchorsOnlyLayout(WELLS_LAYOUT);
    expect(out.columnMapping).toBeUndefined();
    expect(out.headerAnchors.tableStart).toBe('Transaction history');
  });

  it('calibrateColumnMapping finds date and amount columns', () => {
    const lines = [
      '01/15/2025  ACH DEPOSIT PAYROLL          1,500.00',
      '01/16/2025  CHECK 1042                                  250.00'
    ];
    const cal = calibrateColumnMapping(lines, WELLS_LAYOUT.columnMapping);
    expect(cal.sampleRows).toBeGreaterThan(0);
    expect(cal.dateCol).toBeGreaterThanOrEqual(0);
    expect(cal.amountCol).toBeGreaterThanOrEqual(0);
  });

  describe('shouldRejectStoredMongoTemplate', () => {
    it('rejects anchor_miss when tableStart missing from Type B', () => {
      const stale = { headerAnchors: { tableStart: 'Nonexistent ledger block' } };
      const r = shouldRejectStoredMongoTemplate(stale, WELLS_TYPE_B);
      expect(r.reject).toBe(true);
      expect(r.reason).toBe('anchor_miss');
    });

    it('rejects column_mapped_zero when anchors hit but mapping yields 0 rows', () => {
      const r = shouldRejectStoredMongoTemplate(WELLS_LAYOUT, WELLS_TYPE_B);
      expect(r.reject).toBe(true);
      expect(r.reason).toBe('column_mapped_zero');
      expect(r.anchor.status).toBe('ANCHOR_OK');
      expect(r.probe.mappedCount).toBe(0);
    });

    it('accepts layout without columnMapping when anchors hit', () => {
      const anchorsOnly = {
        headerAnchors: { tableStart: 'Transaction history', tableEnd: 'Deposits/Credits' }
      };
      const r = shouldRejectStoredMongoTemplate(anchorsOnly, WELLS_TYPE_B);
      expect(r.reject).toBe(false);
      expect(r.reason).toBeNull();
    });

    it('accepts layout with columnMapping when probe finds rows', () => {
      const goodLayout = {
        headerAnchors: { tableStart: 'Transaction history' },
        columnMapping: { dateCol: 0, descCol: 1, amountCol: 2 }
      };
      const text = `Transaction history
01/15/2025  PAYROLL  1,500.00
01/16/2025  CHECK  250.00`;
      const probe = probeLayoutOnDigitalText(goodLayout, text);
      expect(probe.mappedCount).toBeGreaterThan(0);
      const r = shouldRejectStoredMongoTemplate(goodLayout, text);
      expect(r.reject).toBe(false);
    });
  });
});
