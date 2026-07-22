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

  it('buildMacroResponseEnvelope attaches a composed intelligenceSummary', () => {
    const envelope = buildMacroResponseEnvelope({
      statementId: '507f1f77bcf86cd799439011',
      consolidatedMacroAnalysis: {
        summary: { totalAccountGroups: 1 },
        forensicIntelligence: {
          cashRunwayStress: {
            available: true,
            riskBand: 'HIGH',
            cashPosition: 1000,
            scenarios: {
              currentBurn: { runwayDays: 20, survivesHorizon: false },
              stressedBurn20: { runwayDays: 16, survivesHorizon: false },
              revenueStop: { runwayDays: 10, survivesHorizon: false }
            }
          },
          prospectiveDSCR: 1.2
        },
        underwritingVitals: {
          ownerDraw: { totalDraws: 3000, drawCount: 2, drawToRevenueRatio: 0.35 }
        }
      },
      macroAgg: {},
      allAlerts: [{ code: 'CHILD_SUPPORT_GARNISHMENT', severity: 'HIGH', message: 'x' }],
      accountGroupResults: [{ veritasScore: 700 }],
      applicationData: { companyName: 'Test Co' }
    });

    const summary = envelope.data.intelligenceSummary;
    expect(summary).toBeTruthy();
    expect(summary.headlineRiskBand).toBe('HIGH');
    expect(summary.cashRunway.riskBand).toBe('HIGH');
    expect(summary.ownerDraw.drawToRevenueRatio).toBe(0.35);
    expect(summary.garnishmentFlags.map((f) => f.code)).toContain('CHILD_SUPPORT_GARNISHMENT');
    expect(summary.veritas.averageScore).toBe(700);
    expect(summary.narrative).toMatch(/Intelligence Summary/);
  });
});
