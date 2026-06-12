import { loadContractMocks } from '../contracts/loadContractMocks.js';

/**
 * Heuristic 5 C's scorecard from macro analysis (swap for LLM later).
 */
export function evaluateJuniorUnderwriter({ macroResult = {}, metrics = {}, alerts = {} } = {}) {
  const m = metrics.totalDeposits != null ? metrics : macroResult?.financialTotals || macroResult?.metrics || {};
  const alertItems = alerts.items || macroResult?.alerts || [];
  const nsf = Number(m.nsfCount) || 0;
  const net = Number(m.netCashFlow) || 0;
  const adb = Number(m.averageDailyBalance) || 0;

  const critical = alertItems.filter((a) => String(a.severity).toUpperCase() === 'CRITICAL').length;
  const high = alertItems.filter((a) => String(a.severity).toUpperCase() === 'HIGH').length;

  const character = Math.max(40, Math.min(95, 82 - nsf * 3 - critical * 15));
  const capacity = Math.max(35, Math.min(90, 60 + (net > 0 ? 12 : -10) + (m.totalDeposits > 50000 ? 8 : 0)));
  const capital = Math.max(40, Math.min(92, 55 + Math.min(25, adb / 1000)));
  const collateral = Math.max(45, Math.min(88, 68 - high * 4));
  const conditions = Math.max(50, Math.min(90, 72 - critical * 8));

  const fiveCs = {
    character: { score: Math.round(character), signals: [`NSF count ${nsf}`] },
    capacity: { score: Math.round(capacity), signals: [`Net cash flow ${net >= 0 ? 'positive' : 'negative'}`] },
    capital: { score: Math.round(capital), signals: [`ADB ${adb}`] },
    collateral: { score: Math.round(collateral), signals: ['Deposit consistency proxy'] },
    conditions: { score: Math.round(conditions), signals: [`${high} high-severity alerts`] }
  };

  const scores = Object.values(fiveCs).map((c) => c.score);
  const overallScore = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);

  let decision = 'ADEQUATE';
  if (critical > 0 || overallScore < 55) decision = 'DECLINE';
  else if (overallScore < 65 || nsf >= 5) decision = 'MARGINAL';

  return {
    overallScore,
    decision,
    fiveCs,
    redFlags: critical > 0 ? ['CRITICAL alerts present'] : high >= 2 ? ['Multiple HIGH alerts'] : [],
    metadata: {
      evaluatedAt: new Date().toISOString(),
      source: 'juniorUnderwriterService-heuristic',
      durationMs: 0
    }
  };
}

export function evaluateJuniorUnderwriterOrMock(ctx) {
  const useMock = String(process.env.USE_MOCK_SERVICES ?? 'true').toLowerCase();
  if (useMock === 'true' || useMock === '1') {
    return structuredClone(loadContractMocks().juniorUnderwriter);
  }
  return evaluateJuniorUnderwriter(ctx);
}

export default { evaluateJuniorUnderwriter, evaluateJuniorUnderwriterOrMock };
