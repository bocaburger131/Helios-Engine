import { describe, it, expect } from "vitest";
import { answerFromDealContext } from "../../src/services/ai/gemini.js";

describe("answerFromDealContext", () => {
  const ctx = {
    companyName: "Acme LLC",
    veraDecision: "STIPULATE",
    veraScore: 5.8,
    veritasBadge: "Review",
    metrics: { l3mAdb: 186214, nsfCount: 6 },
    netCashFlow: -24194,
    checksumOk: false,
    checksumFailedFiles: ["BANK STMT.pdf"],
  };

  it("answers checksum from results", () => {
    const a = answerFromDealContext("did this analysis pass checksum?", ctx);
    expect(a).toMatch(/FAIL/i);
    expect(a).toMatch(/BANK STMT/);
  });

  it("answers decision", () => {
    const a = answerFromDealContext("what is the vera decision?", ctx);
    expect(a).toMatch(/STIPULATE/);
    expect(a).toMatch(/5\.8/);
  });

  it("deflects pipeline questions", () => {
    const a = answerFromDealContext("explain the gemini vision extraction pipeline", ctx);
    expect(a).toMatch(/only cover underwriting/i);
  });
});
