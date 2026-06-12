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

describe('contract mocks', () => {
  it('loads all mock JSON files', () => {
    const mocks = loadContractMocks();
    expect(mocks.accountingSummary.revenue.total).toBeGreaterThan(0);
    expect(mocks.juniorUnderwriter.fiveCs.character.score).toBeTypeOf('number');
    expect(mocks.vera.decision).toMatch(/FUND|DECLINE|STIPULATE/);
    expect(mocks.envelope201.data.vera.briefingMarkdown).toBeTruthy();
  });
});

describe('buildMacroResponseEnvelope', () => {
  const prev = process.env.USE_MOCK_SERVICES;

  beforeEach(() => {
    process.env.USE_MOCK_SERVICES = 'true';
  });

  afterEach(() => {
    process.env.USE_MOCK_SERVICES = prev;
  });

  it('returns envelope with required data keys', () => {
    const envelope = buildMacroResponseEnvelope({
      statementId: '507f1f77bcf86cd799439011',
      consolidatedMacroAnalysis: {
        summary: { totalAccountGroups: 1, statementPDFs: 2 },
        financialTotals: { totalDeposits: 1000 },
        forensicIntelligence: { l3m: { averageMonthlyRevenue: 5000 } }
      },
      macroAgg: { nsfCount: 0 },
      allAlerts: [],
      accountGroupResults: [],
      extractedAnchorData: { companyName: 'Acme LLC', taxId: '11-1111111' },
      reqBody: { dealId: 'deal-1' }
    });

    expect(envelope.success).toBe(true);
    expect(envelope._mock).toBe(true);
    for (const key of REQUIRED_DATA_KEYS) {
      expect(envelope.data).toHaveProperty(key);
    }
    expect(envelope.data.vera.briefingMarkdown).toBeTruthy();
    expect(envelope.data.applicationData.companyName).toBe('Acme LLC');
    expect(envelope.data.legacy.report).toBe(envelope.data.vera.briefingMarkdown);
    expect(envelope.applicationData.companyName).toBe('Acme LLC');
  });
});
