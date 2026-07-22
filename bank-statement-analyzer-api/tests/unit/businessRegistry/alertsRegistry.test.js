import { describe, it, expect } from 'vitest';
import AlertsEngineService from '../../../src/services/AlertsEngineService.js';

describe('AlertsEngineService registry alerts', () => {
  it('does not emit BUSINESS_NOT_VERIFIED when SOS disabled', () => {
    const alerts = AlertsEngineService._generateBusinessVerificationAlerts({
      skipped: true,
      reason: 'SOS_DISABLED'
    });
    expect(alerts).toHaveLength(0);
  });

  it('emits SOS_ONBOARDING for unknown state playbook', () => {
    const alerts = AlertsEngineService._generateBusinessVerificationAlerts({
      skipped: true,
      onboarding: true,
      alertCode: 'SOS_ONBOARDING',
      state: 'AK'
    });
    expect(alerts.some((a) => a.code === 'SOS_ONBOARDING')).toBe(true);
  });

  it('emits SOS_CREDENTIALS_REQUIRED for paywall states', () => {
    const alerts = AlertsEngineService._generateBusinessVerificationAlerts({
      skipped: true,
      alertCode: 'SOS_CREDENTIALS_REQUIRED',
      state: 'OH',
      portalSignupUrl: 'https://example.com'
    });
    expect(alerts.some((a) => a.code === 'SOS_CREDENTIALS_REQUIRED')).toBe(true);
  });

  it('emits BUSINESS_NOT_VERIFIED only after attempted search', () => {
    const alerts = AlertsEngineService._generateBusinessVerificationAlerts({
      found: false,
      verificationAttempted: true,
      businessName: 'Test LLC',
      state: 'OH'
    });
    expect(alerts.some((a) => a.code === 'BUSINESS_NOT_VERIFIED')).toBe(true);
  });

  it('emits SOS_VERIFICATION_ERROR for scrape failures without BUSINESS_NOT_VERIFIED', () => {
    const alerts = AlertsEngineService._generateBusinessVerificationAlerts({
      skipped: true,
      alertCode: 'SOS_VERIFICATION_ERROR',
      reason: 'Timeout waiting for selector',
      state: 'OH',
      verificationAttempted: false
    });
    expect(alerts.some((a) => a.code === 'SOS_VERIFICATION_ERROR')).toBe(true);
    expect(alerts.some((a) => a.code === 'BUSINESS_NOT_VERIFIED')).toBe(false);
  });
});
