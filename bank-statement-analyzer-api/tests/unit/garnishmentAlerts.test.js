import { describe, it, expect } from 'vitest';
import { classifyGarnishment, detectGarnishments } from '../../src/utils/garnishmentDetection.js';
import AlertsEngineService from '../../src/services/AlertsEngineService.js';

const GARNISHMENT_CODES = new Set([
  'WAGE_GARNISHMENT_DETECTED',
  'CHILD_SUPPORT_GARNISHMENT',
  'TAX_LEVY_DETECTED'
]);

describe('classifyGarnishment', () => {
  it('maps child support patterns to CHILD_SUPPORT_GARNISHMENT', () => {
    expect(classifyGarnishment('CA SDU CHILD SUPPORT')).toBe('CHILD_SUPPORT_GARNISHMENT');
    expect(classifyGarnishment('COUNTY DCSS WITHHOLD')).toBe('CHILD_SUPPORT_GARNISHMENT');
  });

  it('maps tax levy patterns to TAX_LEVY_DETECTED', () => {
    expect(classifyGarnishment('IRS LEVY PAYMENT')).toBe('TAX_LEVY_DETECTED');
    expect(classifyGarnishment('FTB TAX LIEN DEBIT')).toBe('TAX_LEVY_DETECTED');
  });

  it('maps generic garnish patterns to WAGE_GARNISHMENT_DETECTED', () => {
    expect(classifyGarnishment('LEGAL ORDER DEBIT')).toBe('WAGE_GARNISHMENT_DETECTED');
    expect(classifyGarnishment('WRIT OF GARNISHMENT')).toBe('WAGE_GARNISHMENT_DETECTED');
  });

  it('returns null for unrelated descriptions', () => {
    expect(classifyGarnishment('PAYROLL ACH')).toBeNull();
    expect(classifyGarnishment('')).toBeNull();
  });
});

describe('detectGarnishments', () => {
  it('flags outflows only and ignores inflows', () => {
    const { flags, hasGarnishment } = detectGarnishments([
      { description: 'PAYROLL ACH', amount: 2500, type: 'CREDIT' },
      { description: 'IRS LEVY', amount: -150, type: 'DEBIT' },
      { description: 'CA SDU CHILD SUPPORT', amount: -200, type: 'DEBIT' }
    ]);

    expect(hasGarnishment).toBe(true);
    expect(flags.map((f) => f.code).sort()).toEqual(['CHILD_SUPPORT_GARNISHMENT', 'TAX_LEVY_DETECTED']);
  });

  it('returns empty when no garnishment outflows exist', () => {
    const result = detectGarnishments([
      { description: 'PAYROLL ACH', amount: 2500, type: 'CREDIT' },
      { description: 'OFFICE SUPPLIES', amount: -45, type: 'DEBIT' }
    ]);
    expect(result.hasGarnishment).toBe(false);
    expect(result.flags).toEqual([]);
  });
});

describe('AlertsEngineService._generateGarnishmentAlerts', () => {
  it('emits compliance alerts with expected severities', () => {
    const alerts = AlertsEngineService._generateGarnishmentAlerts({
      transactions: [
        { description: 'IRS LEVY', amount: -100, type: 'DEBIT', date: '2025-01-02' },
        { description: 'LEGAL ORDER DEBIT', amount: -50, type: 'DEBIT', date: '2025-01-03' }
      ]
    });

    expect(alerts.length).toBe(2);
    for (const alert of alerts) {
      expect(GARNISHMENT_CODES.has(alert.code)).toBe(true);
      expect(alert.type).toBe('COMPLIANCE');
      expect(alert.data.count).toBeGreaterThan(0);
    }
    const taxAlert = alerts.find((a) => a.code === 'TAX_LEVY_DETECTED');
    expect(taxAlert?.severity).toBe('CRITICAL');
    const wageAlert = alerts.find((a) => a.code === 'WAGE_GARNISHMENT_DETECTED');
    expect(wageAlert?.severity).toBe('HIGH');
  });

  it('integrates via generateAlerts without flagging payroll credits', () => {
    const alerts = AlertsEngineService.generateAlerts(
      { businessName: 'Test Co' },
      [
        {
          transactions: [
            { description: 'PAYROLL ACH', amount: 3000, type: 'CREDIT', date: '2025-01-01' },
            { description: 'CA SDU CHILD SUPPORT', amount: -175, type: 'DEBIT', date: '2025-01-05' }
          ]
        }
      ],
      {}
    );

    const garnishmentAlerts = alerts.filter((a) => GARNISHMENT_CODES.has(a.code));
    expect(garnishmentAlerts).toHaveLength(1);
    expect(garnishmentAlerts[0].code).toBe('CHILD_SUPPORT_GARNISHMENT');
  });
});
