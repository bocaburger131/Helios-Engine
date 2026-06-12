import { describe, it, expect } from 'vitest';
import {
  reconcileApplicationWithCrm,
  dataConflictsToAlerts
} from '../../src/services/validation/crmReconciliationService.js';

describe('crmReconciliationService', () => {
  it('merges matching application and CRM data', () => {
    const result = reconcileApplicationWithCrm({
      dealId: 'deal-123',
      application: {
        legalName: 'Maas Treats LLC',
        dbaName: 'Maas Treats',
        ein: '987654321',
        requestedAmount: 75000,
        grossAnnualRevenue: 420000
      },
      crmDeal: {
        Deal_Name: 'Maas Treats LLC',
        DBA: 'Maas Treats',
        Tax_ID: '98-7654321',
        Amount: 75000,
        Annual_Revenue: 420000,
        Email: 'owner@example.com'
      }
    });

    expect(result.reconciled).toBe(true);
    expect(result.DATA_CONFLICT).toHaveLength(0);
    expect(result.dealContext.dealId).toBe('deal-123');
    expect(result.dealContext.correlationId).toBe('deal-123');
    expect(result.dealContext.email).toBe('owner@example.com');
    expect(result.dealContext.legalName).toBe('Maas Treats LLC');
  });

  it('injects DATA_CONFLICT on EIN mismatch without throwing', () => {
    const result = reconcileApplicationWithCrm({
      dealId: 'deal-456',
      application: { ein: '111111111', legalName: 'A Corp' },
      crmDeal: { Tax_ID: '222222222', Deal_Name: 'A Corp' }
    });

    expect(result.reconciled).toBe(false);
    expect(result.DATA_CONFLICT).toHaveLength(1);
    expect(result.DATA_CONFLICT[0].field).toBe('ein');
    expect(result.DATA_CONFLICT[0].severity).toBe('MANUAL_VERIFICATION_REQUIRED');
    expect(result.dealContext.dealId).toBe('deal-456');
  });

  it('allows revenue within tolerance', () => {
    const result = reconcileApplicationWithCrm({
      application: { grossAnnualRevenue: 100500 },
      crmDeal: { Annual_Revenue: 100000 }
    });
    expect(result.DATA_CONFLICT.filter((c) => c.field === 'grossAnnualRevenue')).toHaveLength(0);
  });

  it('flags revenue outside tolerance', () => {
    const result = reconcileApplicationWithCrm({
      application: { grossAnnualRevenue: 200000 },
      crmDeal: { Annual_Revenue: 100000 }
    });
    expect(result.DATA_CONFLICT.some((c) => c.field === 'grossAnnualRevenue')).toBe(true);
  });

  it('converts conflicts to batch alerts', () => {
    const alerts = dataConflictsToAlerts([
      {
        field: 'ein',
        applicationValue: '111',
        crmValue: '222',
        severity: 'MANUAL_VERIFICATION_REQUIRED',
        message: 'ein mismatch'
      }
    ]);
    expect(alerts[0].code).toBe('DATA_CONFLICT');
    expect(alerts[0].severity).toBe('MEDIUM');
  });
});
