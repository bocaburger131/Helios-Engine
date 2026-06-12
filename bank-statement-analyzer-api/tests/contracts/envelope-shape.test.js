import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadContractMocks } from '../../src/contracts/loadContractMocks.js';
import { buildMacroResponseEnvelope } from '../../src/services/macroResponseEnvelope.js';

const REQUIRED_DATA_KEYS = [
  'id',
  'deal',
  'coverage',
  'metrics',
  'accountingSummary',
  'juniorUnderwriter',
  'forensicIntelligence',
  'alerts',
  'accountGroups',
  'vera',
  'applicationData',
  'legacy'
];

describe('envelope-shape contract', () => {
  const prev = process.env.USE_MOCK_SERVICES;

  beforeEach(() => {
    process.env.USE_MOCK_SERVICES = 'true';
  });

  afterEach(() => {
    process.env.USE_MOCK_SERVICES = prev;
  });

  it('mock201Envelope.json has required data keys', () => {
    const mocks = loadContractMocks();
    for (const key of REQUIRED_DATA_KEYS) {
      expect(mocks.envelope201.data).toHaveProperty(key);
    }
  });

  it('buildMacroResponseEnvelope matches required key shape', () => {
    const envelope = buildMacroResponseEnvelope({
      statementId: '507f1f77bcf86cd799439011',
      consolidatedMacroAnalysis: { summary: { totalAccountGroups: 1 } },
      macroAgg: {},
      allAlerts: [],
      accountGroupResults: [],
      applicationData: { companyName: 'Test Co' }
    });
    for (const key of REQUIRED_DATA_KEYS) {
      expect(envelope.data).toHaveProperty(key);
    }
  });
});
