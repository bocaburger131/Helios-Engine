/**
 * intelligenceSummary composer — one underwriter-facing payload aggregating
 * forensic intelligence (cash runway), underwriting vitals (owner draw, ADB,
 * NSF, true revenue, MCA), Veritas scoring, and compliance flags (garnishments).
 */

const GARNISHMENT_ALERT_CODES = new Set([
  'WAGE_GARNISHMENT_DETECTED',
  'CHILD_SUPPORT_GARNISHMENT',
  'TAX_LEVY_DETECTED'
]);

const BAND_ORDER = ['LOW', 'MODERATE', 'HIGH', 'CRITICAL'];

function worstBand(bands) {
  let worst = 'LOW';
  for (const b of bands) {
    if (!b) continue;
    if (BAND_ORDER.indexOf(b) > BAND_ORDER.indexOf(worst)) worst = b;
  }
  return worst;
}

const money = (n) =>
  n == null || !Number.isFinite(Number(n)) ? 'n/a' : `$${Number(n).toLocaleString()}`;

function buildGarnishmentFlags(alerts) {
  return (Array.isArray(alerts) ? alerts : [])
    .filter((a) => GARNISHMENT_ALERT_CODES.has(a?.code))
    .map((a) => ({
      code: a.code,
      severity: a.severity || 'HIGH',
      message: a.message || null,
      count: a.data?.count ?? null,
      totalAmount: a.data?.totalAmount ?? null
    }));
}

function buildVitalsDigest(vitals) {
  if (!vitals) return null;
  return {
    adbL3m: vitals.adb?.l3mAverage ?? null,
    negativeDayCount: vitals.liquidity?.negativeDayCount ?? null,
    lowestDailyBalance: vitals.liquidity?.lowestDailyBalance ?? null,
    nsfCount: vitals.nsfAndOverdraft?.nsfCount ?? null,
    overdraftCount: vitals.nsfAndOverdraft?.overdraftCount ?? null,
    trueL3mRevenueAverage: vitals.revenue?.l3mTrueRevenueAverage ?? null,
    mcaStackingDetected: vitals.mcaStacking?.detected ?? null,
    mcaMonthlyDebtServiceProxy: vitals.mcaStacking?.totalMonthlyDebtService ?? null
  };
}

function buildVeritas(veritasScores) {
  const scores = (Array.isArray(veritasScores) ? veritasScores : [])
    .map((s) => Number(s))
    .filter((s) => Number.isFinite(s) && s > 0);
  if (scores.length === 0) return { averageScore: null, scores: [] };
  const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
  return { averageScore: Math.round(avg), scores };
}

function deriveHeadlineRiskBand({ cashRunway, ownerDraw, garnishmentFlags, alerts, briefingAlerts }) {
  const bands = [];
  const dataGaps = [];

  if (cashRunway?.available) {
    bands.push(cashRunway.riskBand);
  } else {
    // Missing runway data must never read as safety: floor the band and flag the gap.
    dataGaps.push('CASH_RUNWAY_UNAVAILABLE');
    bands.push('MODERATE');
  }

  if (garnishmentFlags.some((f) => f.code === 'TAX_LEVY_DETECTED')) bands.push('CRITICAL');
  else if (garnishmentFlags.length > 0) bands.push('HIGH');

  if (ownerDraw?.drawToRevenueRatio != null && ownerDraw.drawToRevenueRatio > 0.3) {
    bands.push('HIGH');
  }

  // Vitals briefing alerts (MCA_STACKING, NEGATIVE_BALANCE_DAYS, NSF_CLUSTER, ...)
  // participate in the band alongside AlertsEngine output.
  const items = [
    ...(Array.isArray(alerts) ? alerts : []),
    ...(Array.isArray(briefingAlerts) ? briefingAlerts : [])
  ];
  if (items.some((a) => String(a?.severity).toUpperCase() === 'CRITICAL')) bands.push('CRITICAL');
  else if (items.some((a) => String(a?.severity).toUpperCase() === 'HIGH')) bands.push('MODERATE');

  return { band: worstBand(bands), dataGaps };
}

function buildNarrative({ headlineRiskBand, cashRunway, ownerDraw, garnishmentFlags, vitals, veritas }) {
  const lines = ['## Intelligence Summary', `- **Headline risk band:** ${headlineRiskBand}`];

  if (cashRunway?.available) {
    const cur = cashRunway.scenarios.currentBurn;
    const stop = cashRunway.scenarios.revenueStop;
    lines.push(
      `- **30-day cash runway:** ${cashRunway.riskBand} — current burn ${
        cur.runwayDays == null ? 'cash-positive' : `${cur.runwayDays} day(s)`
      }, revenue-stop ${stop.runwayDays == null ? 'n/a' : `${stop.runwayDays} day(s)`} on ${money(cashRunway.cashPosition)} cash`
    );
  } else {
    lines.push(
      '- **30-day cash runway:** unavailable (insufficient balance/burn data) — risk band floored at MODERATE'
    );
  }

  if (ownerDraw && ownerDraw.drawCount > 0) {
    const pct =
      ownerDraw.drawToRevenueRatio != null
        ? ` (${(ownerDraw.drawToRevenueRatio * 100).toFixed(1)}% of true revenue)`
        : '';
    lines.push(`- **Owner draws:** ${money(ownerDraw.totalDraws)} across ${ownerDraw.drawCount} txn(s)${pct}`);
  } else {
    lines.push('- **Owner draws:** none detected');
  }

  if (garnishmentFlags.length > 0) {
    lines.push(`- **Garnishments/levies:** ${garnishmentFlags.map((f) => f.code).join(', ')}`);
  } else {
    lines.push('- **Garnishments/levies:** none detected');
  }

  if (vitals) {
    lines.push(
      `- **Vitals:** ADB ${money(vitals.adbL3m)}, ${vitals.negativeDayCount ?? 'n/a'} negative day(s), ` +
        `${(vitals.nsfCount ?? 0) + (vitals.overdraftCount ?? 0)} NSF/OD event(s), ` +
        `true L3M revenue ${money(vitals.trueL3mRevenueAverage)}/mo`
    );
    if (vitals.mcaStackingDetected) {
      lines.push(`- **MCA stacking:** detected (~${money(vitals.mcaMonthlyDebtServiceProxy)}/mo proxy)`);
    }
  }

  if (veritas.averageScore != null) {
    lines.push(`- **Veritas:** ${veritas.averageScore} avg across ${veritas.scores.length} account(s)`);
  }

  return lines.join('\n');
}

/**
 * @param {object} params
 * @param {object|null} params.forensicIntelligence - computeForensicIntelligence output
 * @param {object|null} params.underwritingVitals - computeUnderwritingVitals output
 * @param {number[]} params.veritasScores - per-account Veritas scores
 * @param {Array<object>} params.alerts - consolidated alert objects
 */
export function composeIntelligenceSummary({
  forensicIntelligence = null,
  underwritingVitals = null,
  veritasScores = [],
  alerts = []
} = {}) {
  const cashRunway = forensicIntelligence?.cashRunwayStress ?? null;
  const ownerDraw = underwritingVitals?.ownerDraw ?? null;
  const garnishmentFlags = buildGarnishmentFlags(alerts);
  const vitals = buildVitalsDigest(underwritingVitals);
  const veritas = buildVeritas(veritasScores);
  const briefingAlerts = underwritingVitals?.forensicBriefing?.alerts ?? [];

  const { band: headlineRiskBand, dataGaps } = deriveHeadlineRiskBand({
    cashRunway,
    ownerDraw,
    garnishmentFlags,
    alerts,
    briefingAlerts
  });

  return {
    headlineRiskBand,
    dataGaps,
    cashRunway,
    ownerDraw,
    garnishmentFlags,
    vitals,
    veritas,
    dscr: forensicIntelligence?.prospectiveDSCR ?? null,
    daysCashOnHand: forensicIntelligence?.daysCashOnHand ?? null,
    depositConsistencyScore: forensicIntelligence?.depositConsistencyScore ?? null,
    momentumTrend: forensicIntelligence?.momentum?.overallTrend ?? null,
    narrative: buildNarrative({
      headlineRiskBand,
      cashRunway,
      ownerDraw,
      garnishmentFlags,
      vitals,
      veritas
    }),
    composedAt: new Date().toISOString()
  };
}

export default { composeIntelligenceSummary };
