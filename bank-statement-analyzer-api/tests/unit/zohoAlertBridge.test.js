import { describe, it, expect } from 'vitest';
import { buildIdentityMismatchAlert } from '../../src/services/identityCrossCheckService.js';

const CRM_ALERT_CODES = new Set([
  'IDENTITY_MISMATCH',
  'RECONCILIATION_MISMATCH',
  'VERA_HITL_QUEUED'
]);

function shouldPushAlertToCrm(alert) {
  return (
    alert.severity === 'HIGH' ||
    alert.severity === 'CRITICAL' ||
    CRM_ALERT_CODES.has(String(alert.code || '').toUpperCase())
  );
}

describe('Zoho CRM alert bridge', () => {
  it('pushes IDENTITY_MISMATCH at MEDIUM severity via code filter', () => {
    const alert = buildIdentityMismatchAlert(
      { status: 'review', mismatches: [{ field: 'dba' }], confidence: 0.5 },
      'dec.pdf'
    );
    expect(alert.code).toBe('IDENTITY_MISMATCH');
    expect(shouldPushAlertToCrm(alert)).toBe(true);
  });

  it('pushes RECONCILIATION_MISMATCH HIGH alerts', () => {
    expect(
      shouldPushAlertToCrm({
        code: 'RECONCILIATION_MISMATCH',
        severity: 'HIGH',
        message: 'checksum fail'
      })
    ).toBe(true);
  });

  it('skips LOW alerts outside CRM code set', () => {
    expect(
      shouldPushAlertToCrm({ code: 'LOW_BALANCE', severity: 'LOW', message: 'ok' })
    ).toBe(false);
  });
});
