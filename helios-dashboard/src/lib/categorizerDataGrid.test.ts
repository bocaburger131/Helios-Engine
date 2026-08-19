import { describe, it, expect } from "vitest";
import { normalizeHighLevelCategory } from "@/lib/categorizerTaxonomy";
import { recalcCategorizerVitals } from "@/lib/recalcCategorizerVitals";
import {
  buildLedgerExportRows,
  ledgerRowsToCsv,
} from "@/lib/exportLedger";
import type { HeliosTransaction } from "@/lib/dailyActivityAdapter";

describe("categorizerTaxonomy", () => {
  it("maps legacy AI labels to high-level buckets", () => {
    expect(normalizeHighLevelCategory("OpEx (Operations & Rent)")).toBe("OPEX");
    expect(normalizeHighLevelCategory("COGS (Equipment & Inventory)")).toBe(
      "COGS"
    );
  });
});

describe("recalcCategorizerVitals", () => {
  it("moves OpEx debit into Non-Revenue Transfer and updates totals", () => {
    const base: HeliosTransaction[] = [
      {
        type: "CREDIT",
        amount: 20000,
        category: "INCOME",
        description: "Sales",
      },
      {
        type: "DEBIT",
        amount: 15000,
        category: "OPEX",
        description: "Vendor",
        _id: "t1",
      },
    ];
    const before = recalcCategorizerVitals(base);
    expect(before.totalOpex).toBe(15000);
    expect(before.trueMonthlyRevenue).toBe(20000);
    expect(before.netCashFlow).toBe(5000);

    const afterRows = base.map((t) =>
      t._id === "t1"
        ? { ...t, category: "NON-REVENUE TRANSFER", categorizationSource: "analyst_override" }
        : t
    );
    const after = recalcCategorizerVitals(afterRows);
    expect(after.totalOpex).toBe(0);
    expect(after.netCashFlow).toBe(5000);
    expect(after.trueMonthlyRevenue).toBe(20000);
  });
});

describe("exportLedger", () => {
  it("includes overridden category in CSV", () => {
    const rows: HeliosTransaction[] = [
      {
        date: "2024-01-15",
        description: "RAW PDF LINE",
        type: "DEBIT",
        amount: -15000,
        category: "NON-REVENUE TRANSFER",
        subcategory: "OWNER DRAW",
        taxDeductible: "non_deductible",
        categorizationSource: "analyst_override",
      },
    ];
    const csv = ledgerRowsToCsv(buildLedgerExportRows(rows));
    expect(csv).toContain("RAW PDF LINE");
    expect(csv).toContain("Non-Revenue Transfer");
    expect(csv).toContain("Analyst Overridden");
  });
});
