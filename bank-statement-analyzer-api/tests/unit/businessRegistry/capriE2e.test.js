/**
 * Capri E2E validation — Ohio-only registry dispatch, L3M charts, alert semantics.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import AlertsEngineService from '../../../src/services/AlertsEngineService.js';
import { buildChartActivityRollup } from '../../../src/utils/chartActivityRollup.js';
import { parseStateFromAddress, resolveStateCode } from '../../../src/services/businessRegistry/stateResolver.js';
import { verifyBusinessRegistry } from '../../../src/services/businessRegistry/orchestrator.js';
import StateRegistryProfile from '../../../src/models/StateRegistryProfile.js';

describe('Capri E2E validation', () => {
  const capriTxns = [
    { date: '2025-01-15', amount: 1104.54, type: 'CREDIT', description: 'Orig CO Name:Capri' },
    { date: '2025-02-01', amount: 762.06, type: 'CREDIT', description: 'Ind Name:Capri' },
    { date: '2025-02-02', amount: -200, type: 'DEBIT', description: 'Payment' },
    { date: '2025-03-10', amount: 500, type: 'CREDIT', description: 'Deposit' }
  ];

  it('extracts OH registrationState from Capri-style Ohio address', () => {
    const address = '123 Main St, Columbus, OH 43215';
    expect(resolveStateCode('Ohio')).toBe('OH');
    expect(parseStateFromAddress(address)).toBe('OH');
  });

  it('never defaults to CA when registrationState is OH', () => {
    expect(resolveStateCode('CA')).toBe('CA');
    expect(resolveStateCode('OH')).toBe('OH');
    expect(resolveStateCode('Ohio')).toBe('OH');
    expect(resolveStateCode(null)).toBeNull();
  });

  it('builds L3M window for three Capri monthly statements', () => {
    const rollup = buildChartActivityRollup(capriTxns, 5000);
    expect(rollup.windows?.l3m).toBeTruthy();
    expect(rollup.windows.l3m.deposits).toBeGreaterThan(0);
    expect(rollup.windows.l3m.net).toBe(
      rollup.windows.l3m.deposits - rollup.windows.l3m.withdrawals
    );
    expect(rollup.windows.l3m.daysInWindow).toBeGreaterThan(0);
  });

  it('does not emit BUSINESS_NOT_VERIFIED for OH onboarding', () => {
    const sosData = {
      skipped: true,
      onboarding: true,
      alertCode: 'SOS_ONBOARDING',
      state: 'OH',
      businessName: 'Capri LLC',
      source: 'businessRegistryOrchestrator'
    };
    const alerts = AlertsEngineService._generateBusinessVerificationAlerts(sosData);
    expect(alerts.some((a) => a.code === 'BUSINESS_NOT_VERIFIED')).toBe(false);
    expect(alerts.some((a) => a.code === 'SOS_ONBOARDING')).toBe(true);
  });

  describe('orchestrator state dispatch', () => {
    const originalEnv = { ...process.env };

    beforeEach(() => {
      process.env.USE_SOS_VERIFICATION = 'true';
      process.env.REGISTRY_BROWSER_DISABLED = 'true';
      vi.spyOn(StateRegistryProfile, 'findOne').mockImplementation(async (query) => {
        const code = query?.stateCode;
        if (code === 'OH') {
          return {
            stateCode: 'OH',
            accessTier: 'FREE_PUBLIC',
            officialPortalUrl: 'https://businesssearch.ohiosos.gov/',
            playbooks: [
              {
                version: 1,
                status: 'VERIFIED',
                strategy: 'BROWSER_PLAYBOOK',
                mapping: { id: 'OH', entryUrl: 'https://businesssearch.ohiosos.gov/' }
              }
            ]
          };
        }
        if (code === 'CA') {
          return {
            stateCode: 'CA',
            accessTier: 'FREE_PUBLIC',
            playbooks: [{ version: 1, status: 'VERIFIED', mapping: { id: 'CA' } }]
          };
        }
        return null;
      });
    });

    afterEach(() => {
      process.env = { ...originalEnv };
      vi.restoreAllMocks();
    });

    it('dispatches OH playbook only when registrationState is OH (CA never invoked)', async () => {
      const ohResult = await verifyBusinessRegistry({
        businessName: 'Capri LLC',
        registrationState: 'OH'
      });
      expect(ohResult.state).toBe('OH');
      expect(ohResult.source).toBe('businessRegistryOrchestrator');
      expect(StateRegistryProfile.findOne).toHaveBeenCalledWith({ stateCode: 'OH' });
      expect(StateRegistryProfile.findOne).not.toHaveBeenCalledWith({ stateCode: 'CA' });
    });

    it('returns SOS_ONBOARDING for unknown state without false not-verified alert', async () => {
      const akResult = await verifyBusinessRegistry({
        businessName: 'Capri LLC',
        registrationState: 'AK'
      });
      expect(akResult.alertCode).toBe('SOS_ONBOARDING');
      expect(akResult.skipped).toBe(true);
      const alerts = AlertsEngineService._generateBusinessVerificationAlerts(akResult);
      expect(alerts.some((a) => a.code === 'BUSINESS_NOT_VERIFIED')).toBe(false);
    });
  });
});
