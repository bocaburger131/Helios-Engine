/**
 * DSCR eligibility scenarios from forensic intelligence + loan amount.
 */

import type { HeliosStatementPayload } from "@/lib/analysisAdapter";
import { l3mMovingAverageNet } from "@/lib/ProjectionsEngine";
import { parseIntegrity } from "@/lib/analysisAdapter";

export type EligibilityBand = "Strong" | "Moderate" | "Weak" | "Ineligible" | "Unreliable";

export type EligibilityResult = {
  dscr: number | null;
  proposedMonthlyPayment: number | null;
  monthlyNetCashFlow: number | null;
  band: EligibilityBand;
};

export function calculateDSCR(
  monthlyNetCashFlow: number | null,
  requestedLoanAmount: number | null,
  factor = 0.02
): number | null {
  if (monthlyNetCashFlow == null || requestedLoanAmount == null || requestedLoanAmount <= 0) {
    return null;
  }
  const payment = requestedLoanAmount * factor;
  if (payment <= 0) return null;
  const ratio = monthlyNetCashFlow / payment;
  if (!Number.isFinite(ratio) || ratio > 50) return null;
  return Number(ratio.toFixed(2));
}

export function eligibilityBandFromDSCR(dscr: number | null): EligibilityBand {
  if (dscr == null) return "Ineligible";
  if (dscr >= 1.25) return "Strong";
  if (dscr >= 1.0) return "Moderate";
  if (dscr >= 0.75) return "Weak";
  return "Ineligible";
}

export function computeEligibility(
  payload: HeliosStatementPayload,
  loanAmountOverride?: number | null
): EligibilityResult {
  const integrity = parseIntegrity(payload);
  const statement = payload.data?.statement;
  const veraDecision = String(statement?.analysis?.vera?.decision || "").toLowerCase();

  if (
    !integrity.trustedForMetrics ||
    veraDecision.includes("decline") ||
    veraDecision.includes("reject")
  ) {
    return {
      dscr: null,
      proposedMonthlyPayment: null,
      monthlyNetCashFlow: null,
      band: "Unreliable",
    };
  }

  const forensic = statement?.analysis?.forensicIntelligence;
  const requested =
    loanAmountOverride ??
    statement?.applicationContext?.requestedLoanAmount ??
    forensic?.window?.requestedLoanAmount ??
    null;

  const monthlyNet =
    forensic?.window?.monthlyNetCashFlow ??
    l3mMovingAverageNet(payload);

  const factor = 0.02;
  const proposedMonthlyPayment =
    requested != null && requested > 0 ? requested * factor : null;

  const dscr = calculateDSCR(monthlyNet, requested, factor);

  return {
    dscr,
    proposedMonthlyPayment,
    monthlyNetCashFlow: monthlyNet,
    band: eligibilityBandFromDSCR(dscr),
  };
}
