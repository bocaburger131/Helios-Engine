import { describe, it, expect } from 'vitest';
import { buildIdentityMismatchAlert } from '../../src/services/identityCrossCheckService.js';
import { buildReconciliationMismatchAlert } from '../../src/services/templateGraduationService.js';
import { buildChecksumGateBestEffortAlert } from '../../src/utils/macroBestEffort.js';

const ALERT_TYPES = new Set(['INCOME', 'EXPENSE', 'PATTERN', 'FRAUD', 'COMPLIANCE', 'RISK']);
const ALERT_CODES = new Set([
  'RECONCILIATION_MISMATCH',
  'IDENTITY_MISMATCH',
  'DATA_INCONSISTENCY'
]);

function assertMongooseCompatible(alert) {
  expect(ALERT_CODES.has(alert.code)).toBe(true);
  expect(ALERT_TYPES.has(alert.type)).toBe(true);
  expect(alert.severity).toBeTruthy();
}

describe('alert builders — Mongoose enum compatibility', () => {
  it('buildIdentityMismatchAlert uses COMPLIANCE type', () => {
    const alert = buildIdentityMismatchAlert(
      { status: 'mismatch', mismatches: [], confidence: 0.5 },
      'jan.pdf'
    );
    assertMongooseCompatible(alert);
    expect(alert.code).toBe('IDENTITY_MISMATCH');
    expect(alert.type).toBe('COMPLIANCE');
  });

  it('buildReconciliationMismatchAlert uses COMPLIANCE type', () => {
    const alert = buildReconciliationMismatchAlert({
      opening: 1,
      closing: 2,
      deposits: 3,
      withdrawals: 1,
      computedClosing: '3.00',
      delta: '1.0000',
      reason: 'checksum mismatch'
    });
    assertMongooseCompatible(alert);
    expect(alert.type).toBe('COMPLIANCE');
  });

  it('buildChecksumGateBestEffortAlert uses COMPLIANCE type', () => {
    const alert = buildChecksumGateBestEffortAlert(
      { ratio: 0.5, okCount: 1, total: 2 },
      0.8,
      null
    );
    assertMongooseCompatible(alert);
    expect(alert.type).toBe('COMPLIANCE');
  });
});
