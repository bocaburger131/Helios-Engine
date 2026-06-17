import { describe, it, expect } from 'vitest';
import {
  assessInstitutionProfileGate,
  scanRtnFromText
} from '../../src/services/institutionProfileGateService.js';

describe('institutionProfileGateService', () => {
  it('scanRtnFromText finds Regions RTN', () => {
    const text = 'Routing number 062000019 Regions Bank';
    expect(scanRtnFromText(text)).toBe('062000019');
  });

  it('requires Step 1 for generic_digital probe', () => {
    const gate = assessInstitutionProfileGate({
      text: 'Unknown community bank statement',
      institutionalProfile: null
    });
    expect(gate.step1Required).toBe(true);
    expect(gate.probeOnly).toBe(true);
    expect(gate.productionReady).toBe(false);
  });

  it('requires VERIFIED template even when Tier-1 code profile matches', () => {
    const text = [
      'Regions Bank',
      'SUMMARY',
      'Electronic Deposits',
      'Beginning balance $1,000.00',
      'Deposits & Credits $500.00',
      'Ending balance $1,300.00'
    ].join('\n');
    const gate = assessInstitutionProfileGate({
      text,
      rtn: '062000019',
      bankName: 'Regions Bank',
      institutionalProfile: {
        _id: 'prof1',
        legalName: 'Regions Bank',
        templates: [{ version: 1, status: 'LEARNING', mapping: {} }]
      }
    });
    expect(gate.codeProfileId).toBe('regions_business_checking');
    expect(gate.step1Required).toBe(true);
    expect(gate.profileStatus).toBe('LEARNING');
    expect(gate.productionReady).toBe(false);
  });

  it('productionReady when Tier-1 profile and VERIFIED template', () => {
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
      checksumPassRatio: 0.9
    });
    expect(gate.productionReady).toBe(true);
    expect(gate.step1Required).toBe(false);
    expect(gate.profileStatus).toBe('VERIFIED');
    expect(gate.layoutDiscoveryStatus).toBe('complete');
  });

  it('step1Required when layout map missing even with VERIFIED template', () => {
    const text = 'Chase Business Complete Checking deposits and additions';
    const gate = assessInstitutionProfileGate({
      text,
      rtn: '021000021',
      bankName: 'Chase',
      institutionalProfile: {
        _id: 'prof2',
        legalName: 'Chase',
        templates: [{ version: 2, status: 'VERIFIED', mapping: {} }]
      },
      layoutDiscoveryPresent: false,
      checksumPassRatio: 1
    });
    expect(gate.step1Required).toBe(true);
    expect(gate.productionReady).toBe(false);
    expect(gate.layoutDiscoveryStatus).toBe('failed');
  });
});
