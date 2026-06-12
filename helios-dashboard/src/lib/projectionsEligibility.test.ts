import { describe, it, expect } from "vitest";
import { calculateDSCR, eligibilityBandFromDSCR } from "./EligibilityCalculator";
import { l3mMovingAverageNet } from "./ProjectionsEngine";
import type { HeliosStatementPayload } from "./analysisAdapter";

const FIXTURE_PAYLOAD = {
  data: {
    statement: {
      applicationContext: { requestedLoanAmount: 11000 },
      analysis: {
        forensicIntelligence: {
          window: {
            monthlyNetCashFlow: -12000,
            monthlyBreakdown: [
              { key: "2023-12", label: "Dec", deposits: 100, withdrawals: 200 },
              { key: "2024-01", label: "Jan", deposits: 150, withdrawals: 250 },
            ],
          },
        },
      },
      monthlyStatementSummaries: [],
    },
  },
} as HeliosStatementPayload;

describe("ProjectionsEngine", () => {
  it("computes L3M moving average net from forensic breakdown", () => {
    const avg = l3mMovingAverageNet(FIXTURE_PAYLOAD);
    expect(avg).not.toBeNull();
  });
});

describe("EligibilityCalculator", () => {
  it("returns null DSCR for zero loan", () => {
    expect(calculateDSCR(1000, 0)).toBeNull();
  });

  it("maps weak DSCR to Ineligible band", () => {
    expect(eligibilityBandFromDSCR(0.42)).toBe("Ineligible");
  });

  it("maps strong DSCR", () => {
    expect(eligibilityBandFromDSCR(1.5)).toBe("Strong");
  });
});
