/**
 * Maps GET /api/statements/:id envelope to HeliosReportDashboard view model.
 */

import {
  buildBaseMonthlyRows,
  effectiveChecksumOk,
  extractDashboardMeta,
  formatCurrency,
  parseIntegrity,
  type HeliosStatementPayload,
} from "@/lib/analysisAdapter";

export type VeritasBadge = "Pass" | "Review" | "Decline";

export type EnvelopeViewModel = {
  companyName: string;
  displayTitle: string;
  analyzedAt: string | null;
  monthsAnalyzedLabel: string;
  businessAddress: string;
  bankName: string;
  accountNumber: string;
  dealId: string | null;
  requestedLoanAmount: number | null;
  statedRevenue: number | null;
  revenueVariancePct: number | null;
  revenueVarianceLabel: string;
  veritasScore: number | null;
  veritasBadge: VeritasBadge;
  bankabilityLabel: string;
  parseTrusted: boolean;
  metrics: {
    l3mAdb: number | null;
    nsfCount: number | null;
    dscr: number | null;
    daysCashOnHand: number | null;
    consistencyScore: number | null;
  };
  veraDecision: string | null;
  veraScore: number | null;
  veraBriefing: string | null;
  coverageMonths: number;
  alerts: Array<{ code?: string; message?: string; severity?: string }>;
};

function num(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function veritasBadgeFromScore(score: number | null, decision?: string): VeritasBadge {
  const d = String(decision || "").toLowerCase();
  if (d.includes("decline") || d.includes("reject")) return "Decline";
  if (d.includes("review") || d.includes("caution")) return "Review";
  if (score != null && score >= 7) return "Pass";
  if (score != null && score >= 5) return "Review";
  if (score != null) return "Decline";
  return "Review";
}

function bankabilityLabel(score: number | null, decision?: string): string {
  const d = String(decision || "").toLowerCase();
  if (d.includes("decline") || d.includes("reject")) return "High risk";
  if (score == null) return "Pending";
  if (score >= 8) return "Strong";
  if (score >= 6) return "Moderate";
  if (score >= 4) return "Weak";
  return "High risk";
}

function revenueVariance(
  stated: number | null,
  observedDeposits: number
): { pct: number | null; label: string } {
  if (stated == null || stated <= 0 || observedDeposits <= 0) {
    return { pct: null, label: "No stated revenue" };
  }
  const monthlyObserved = observedDeposits / Math.max(1, 12);
  const pct = ((monthlyObserved - stated / 12) / (stated / 12)) * 100;
  const rounded = Math.round(pct);
  if (Math.abs(rounded) <= 10) return { pct: rounded, label: "Within range" };
  if (rounded > 0) return { pct: rounded, label: "Above stated" };
  return { pct: rounded, label: "Below stated" };
}

function daysCashOnHand(adb: number | null, avgWithdrawals: number): number | null {
  if (adb == null || avgWithdrawals <= 0) return null;
  const dailyBurn = avgWithdrawals / 30;
  if (dailyBurn <= 0) return null;
  return Math.round(adb / dailyBurn);
}

function consistencyFromSummaries(
  summaries: Array<{ checksumOk?: boolean; reconciliation?: { checksumOk?: boolean | null } | null }>
): number | null {
  if (!summaries.length) return null;
  const ok = summaries.filter((s) => effectiveChecksumOk(s)).length;
  return Math.round((ok / summaries.length) * 100);
}

export function buildEnvelopeViewModel(
  payload: HeliosStatementPayload
): EnvelopeViewModel {
  const statement = payload.data?.statement;
  const meta = extractDashboardMeta(payload);
  const analysis = statement?.analysis;
  const vera = analysis?.vera;
  const vitals = analysis?.underwritingVitals;
  const summaries = statement?.monthlyStatementSummaries ?? [];
  const monthlyRows = buildBaseMonthlyRows(payload);
  const integrity = parseIntegrity(payload);

  const totalDeposits = monthlyRows.reduce((s, r) => s + r.deposits, 0);
  const totalWithdrawals = monthlyRows.reduce((s, r) => s + r.withdrawals, 0);
  const monthCount = Math.max(1, monthlyRows.length);

  const stated =
    num(statement?.applicationContext?.statedRevenue) ??
    num((statement?.applicationContext as { statedGAR?: number })?.statedGAR) ??
    num((statement?.applicationContext as { annualRevenue?: number })?.annualRevenue);

  const variance = revenueVariance(stated, totalDeposits);
  const veraScore = num(vera?.bankabilityScore);
  const veritasScore =
    veraScore ??
    num((analysis as { veritasScore?: number })?.veritasScore) ??
    null;

  const avgWithdrawals = totalWithdrawals / monthCount;

  const rawL3mAdb = meta.l3mAverageAdb ?? vitals?.adb?.l3mAverage ?? null;
  const l3mAdb = integrity.trustedForMetrics ? rawL3mAdb : null;

  const nsfAndOd = vitals?.nsfAndOverdraft as
    | { nsfCount?: number; overdraftCount?: number }
    | undefined;
  const rawNsf =
    num(nsfAndOd?.nsfCount) ??
    num(nsfAndOd?.overdraftCount) ??
    num((analysis?.financialTotals as { nsfCount?: number })?.nsfCount) ??
    num(statement?.analytics?.riskMetrics?.overdraftCount);
  const nsfCount = integrity.trustedForMetrics ? rawNsf : null;

  const rawDscr =
    num(analysis?.projections?.projectedDSCR) ??
    num(analysis?.forensicIntelligence?.prospectiveDSCR);
  const dscr = integrity.trustedForMetrics ? rawDscr : null;

  return {
    companyName: meta.companyName,
    displayTitle: meta.displayTitle,
    analyzedAt: meta.analyzedAt,
    monthsAnalyzedLabel: meta.monthsAnalyzedLabel,
    businessAddress:
      (statement?.applicationContext as { businessAddress?: string })?.businessAddress ||
      "",
    bankName: meta.bankName,
    accountNumber: meta.accountNumber,
    dealId: (statement?.applicationContext as { dealId?: string })?.dealId ?? null,
    requestedLoanAmount: meta.requestedLoanAmount,
    statedRevenue: stated,
    revenueVariancePct: variance.pct,
    revenueVarianceLabel: variance.label,
    veritasScore,
    veritasBadge: integrity.trustedForMetrics
      ? veritasBadgeFromScore(veritasScore, vera?.decision)
      : "Review",
    bankabilityLabel: integrity.trustedForMetrics
      ? bankabilityLabel(veritasScore, vera?.decision)
      : "Unverified parse",
    parseTrusted: integrity.trustedForMetrics,
    metrics: {
      l3mAdb,
      nsfCount,
      dscr,
      daysCashOnHand: integrity.trustedForMetrics
        ? daysCashOnHand(l3mAdb, avgWithdrawals)
        : null,
      consistencyScore: consistencyFromSummaries(summaries),
    },
    veraDecision: vera?.decision ?? null,
    veraScore,
    veraBriefing: vera?.briefingMarkdown ?? null,
    coverageMonths: summaries.length || monthlyRows.length,
    alerts: (statement?.alerts as EnvelopeViewModel["alerts"]) ?? [],
  };
}

export { formatCurrency };
