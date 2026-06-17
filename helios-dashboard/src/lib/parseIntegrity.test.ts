import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import {
  parseIntegrity,
  effectiveChecksumOk,
  type HeliosStatementPayload,
} from "./analysisAdapter";
import { buildEnvelopeViewModel } from "./envelopeAdapter";
import { computeEligibility } from "./EligibilityCalculator";

const FIXTURE = JSON.parse(
  readFileSync(
    path.join(process.cwd(), "fixtures/premier-fitness-checksum-failed.fixture.json"),
    "utf8"
  )
) as HeliosStatementPayload;

describe("parseIntegrity — checksum failed fixture", () => {
  it("marks Premier Fitness parse as untrusted", () => {
    const integrity = parseIntegrity(FIXTURE);
    expect(integrity.checksumPassRate).toBe(0);
    expect(integrity.trustedForMetrics).toBe(false);
    expect(integrity.degraded).toBe(true);
  });

  it("nulls inflated headline metrics in envelope view model", () => {
    const vm = buildEnvelopeViewModel(FIXTURE);
    expect(vm.parseTrusted).toBe(false);
    expect(vm.metrics.l3mAdb).toBeNull();
    expect(vm.metrics.dscr).toBeNull();
    expect(vm.metrics.nsfCount).toBeNull();
    expect(vm.veraDecision).toBe("DECLINE");
    expect(vm.bankabilityLabel).toBe("Unverified parse");
    expect(vm.veritasBadge).toBe("Review");
  });

  it("returns Unreliable eligibility band", () => {
    const elig = computeEligibility(FIXTURE);
    expect(elig.band).toBe("Unreliable");
    expect(elig.dscr).toBeNull();
  });
});

describe("parseIntegrity — universal checksum overrides macro failure", () => {
  it("trusts metrics when reconciliation.checksumOk passes despite macro FAILED_CHECKSUM", () => {
    const payload: HeliosStatementPayload = {
      data: {
        statement: {
          closingBalance: 5000,
          monthlyStatementSummaries: Array.from({ length: 10 }, (_, i) => ({
            fileName: `stmt-${i}.pdf`,
            checksumOk: false,
            parseQuality: "FAILED_CHECKSUM",
            reconciliation: { checksumOk: true },
          })),
          analysis: {
            metadata: {
              parseOutcome: "OK",
              institutionProfileGate: { productionReady: true },
            },
            underwritingVitals: { adb: { l3mAverage: 12000 } },
          },
          transactions: [{ date: "2024-01-01", amount: 100 }],
        },
      },
    };

    const integrity = parseIntegrity(payload);
    expect(integrity.checksumPassRate).toBe(1);
    expect(integrity.trustedForMetrics).toBe(true);

    const vm = buildEnvelopeViewModel(payload);
    expect(vm.parseTrusted).toBe(true);
    expect(vm.metrics.consistencyScore).toBe(100);
  });

  it("effectiveChecksumOk prefers reconciliation.checksumOk", () => {
    expect(
      effectiveChecksumOk({
        checksumOk: false,
        reconciliation: { checksumOk: true },
      })
    ).toBe(true);
    expect(
      effectiveChecksumOk({
        checksumOk: true,
        reconciliation: { checksumOk: false },
      })
    ).toBe(false);
  });
});
