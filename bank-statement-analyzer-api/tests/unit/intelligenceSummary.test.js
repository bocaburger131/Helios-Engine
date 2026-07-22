import { describe, it, expect } from 'vitest';
import { composeIntelligenceSummary } from '../../src/services/intelligenceSummaryService.js';

describe('composeIntelligenceSummary', () => {
  it('floors the band at MODERATE with a dataGap when no inputs are available', () => {
    const s = composeIntelligenceSummary();
    expect(s.headlineRiskBand).toBe('MODERATE');
    expect(s.dataGaps).toEqual(['CASH_RUNWAY_UNAVAILABLE']);
    expect(s.cashRunway).toBeNull();
    expect(s.ownerDraw).toBeNull();
    expect(s.garnishmentFlags).toEqual([]);
    expect(s.vitals).toBeNull();
    expect(s.veritas.averageScore).toBeNull();
    expect(s.narrative).toMatch(/unavailable/);
    expect(s.narrative).toMatch(/floored at MODERATE/);
    expect(s.composedAt).toBeTruthy();
  });

  it('reports no dataGaps and can band LOW when the runway is available', () => {
    const s = composeIntelligenceSummary({
      forensicIntelligence: {
        cashRunwayStress: {
          available: true,
          riskBand: 'LOW',
          scenarios: { currentBurn: {}, revenueStop: {} }
        }
      }
    });
    expect(s.headlineRiskBand).toBe('LOW');
    expect(s.dataGaps).toEqual([]);
  });

  it('escalates the headline band to the worst contributing signal', () => {
    const s = composeIntelligenceSummary({
      forensicIntelligence: { cashRunwayStress: { available: true, riskBand: 'MODERATE', scenarios: { currentBurn: {}, revenueStop: {} } } },
      alerts: [{ code: 'TAX_LEVY_DETECTED', severity: 'CRITICAL', message: 'IRS LEVY' }]
    });
    expect(s.headlineRiskBand).toBe('CRITICAL');
    expect(s.garnishmentFlags).toHaveLength(1);
    expect(s.garnishmentFlags[0].code).toBe('TAX_LEVY_DETECTED');
  });

  it('flags high owner draw as HIGH band and includes it in the narrative', () => {
    const s = composeIntelligenceSummary({
      underwritingVitals: {
        ownerDraw: { totalDraws: 4000, drawCount: 3, drawToRevenueRatio: 0.4 },
        adb: { l3mAverage: 5000 },
        liquidity: { negativeDayCount: 0 },
        nsfAndOverdraft: { nsfCount: 0, overdraftCount: 0 },
        revenue: { l3mTrueRevenueAverage: 10000 },
        mcaStacking: { detected: false }
      }
    });
    expect(s.headlineRiskBand).toBe('HIGH');
    expect(s.narrative).toMatch(/Owner draws/);
    expect(s.narrative).toMatch(/40\.0%/);
    expect(s.vitals.adbL3m).toBe(5000);
  });

  it('non-garnishment HIGH alerts only raise the band to MODERATE', () => {
    const s = composeIntelligenceSummary({
      alerts: [{ code: 'HIGH_CREDIT_RISK', severity: 'HIGH', message: 'x' }]
    });
    expect(s.headlineRiskBand).toBe('MODERATE');
    expect(s.garnishmentFlags).toEqual([]);
  });

  it('merges forensicBriefing alerts into the band derivation', () => {
    const availableLowRunway = {
      cashRunwayStress: {
        available: true,
        riskBand: 'LOW',
        scenarios: { currentBurn: {}, revenueStop: {} }
      }
    };
    const high = composeIntelligenceSummary({
      forensicIntelligence: availableLowRunway,
      underwritingVitals: {
        forensicBriefing: {
          alerts: [{ code: 'MCA_STACKING', severity: 'HIGH', message: '3 MCA lenders' }]
        }
      }
    });
    expect(high.headlineRiskBand).toBe('MODERATE');

    const critical = composeIntelligenceSummary({
      forensicIntelligence: availableLowRunway,
      underwritingVitals: {
        forensicBriefing: {
          alerts: [{ code: 'NEGATIVE_BALANCE_DAYS', severity: 'CRITICAL', message: '12 negative days' }]
        }
      }
    });
    expect(critical.headlineRiskBand).toBe('CRITICAL');
  });

  it('averages only positive finite veritas scores', () => {
    const s = composeIntelligenceSummary({ veritasScores: [700, 0, null, 500, NaN] });
    expect(s.veritas.averageScore).toBe(600);
    expect(s.veritas.scores).toEqual([700, 500]);
  });
});
