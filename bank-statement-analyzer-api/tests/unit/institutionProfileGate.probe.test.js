import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  isProbeAnalysisAllowed,
  assessInstitutionProfileGate
} from '../../src/services/institutionProfileGateService.js';

describe('isProbeAnalysisAllowed', () => {
  const prevNodeEnv = process.env.NODE_ENV;
  const prevProbeDefault = process.env.INSTITUTION_PROFILE_PROBE_DEFAULT;
  const prevDemoMode = process.env.DEMO_MODE;

  afterEach(() => {
    process.env.NODE_ENV = prevNodeEnv;
    process.env.INSTITUTION_PROFILE_PROBE_DEFAULT = prevProbeDefault;
    process.env.DEMO_MODE = prevDemoMode;
  });

  it('honors explicit allowProbeAnalysis=true in body', () => {
    process.env.INSTITUTION_PROFILE_PROBE_DEFAULT = 'false';
    expect(isProbeAnalysisAllowed({ body: { allowProbeAnalysis: 'true' } })).toBe(true);
  });

  it('honors explicit allowProbeAnalysis=false in body', () => {
    process.env.INSTITUTION_PROFILE_PROBE_DEFAULT = 'true';
    delete process.env.DEMO_MODE;
    delete process.env.APP_MODE;
    delete process.env.DISABLE_AUTH;
    expect(isProbeAnalysisAllowed({ body: { allowProbeAnalysis: false } })).toBe(false);
  });

  it('defaults to true in non-production when env unset', () => {
    delete process.env.INSTITUTION_PROFILE_PROBE_DEFAULT;
    process.env.NODE_ENV = 'development';
    expect(isProbeAnalysisAllowed({ body: {} })).toBe(true);
  });

  it('defaults to false in production when env unset', () => {
    delete process.env.INSTITUTION_PROFILE_PROBE_DEFAULT;
    process.env.NODE_ENV = 'production';
    delete process.env.DEMO_MODE;
    expect(isProbeAnalysisAllowed({ body: {} })).toBe(false);
  });

  it('always allows probe in demo mode even when production and env false', () => {
    process.env.NODE_ENV = 'production';
    process.env.INSTITUTION_PROFILE_PROBE_DEFAULT = 'false';
    process.env.DEMO_MODE = 'true';
    expect(isProbeAnalysisAllowed({ body: {} })).toBe(true);
  });
});

describe('assessInstitutionProfileGate layoutLearningActive', () => {
  const prevDemoMode = process.env.DEMO_MODE;

  afterEach(() => {
    process.env.DEMO_MODE = prevDemoMode;
  });

  it('sets layoutLearningActive in demo when step1 required', () => {
    process.env.DEMO_MODE = 'true';
    const gate = assessInstitutionProfileGate({
      text: 'generic bank statement',
      layoutDiscoveryPresent: false
    });
    expect(gate.step1Required).toBe(true);
    expect(gate.layoutLearningActive).toBe(true);
    expect(gate.recommendation).toMatch(/Demo mode/i);
  });

  it('forces learning stage for all banks in demo even with VERIFIED template and full checksum', () => {
    process.env.DEMO_MODE = 'true';
    const text = 'Chase Business Complete Checking deposits and additions';
    const gate = assessInstitutionProfileGate({
      text,
      rtn: '021000021',
      bankName: 'Chase',
      institutionalProfile: {
        _id: 'prof2',
        legalName: 'Chase',
        templates: [{ version: 2, status: 'VERIFIED', mapping: { headerAnchors: [] } }]
      },
      layoutDiscoveryPresent: true,
      checksumPassRatio: 1
    });
    expect(gate.step1Required).toBe(true);
    expect(gate.productionReady).toBe(false);
    expect(gate.layoutLearningActive).toBe(true);
    expect(gate.recommendation).toMatch(/Demo mode/i);
  });
});
