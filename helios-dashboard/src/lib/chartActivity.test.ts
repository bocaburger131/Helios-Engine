import { describe, it, expect } from "vitest";
import {
  buildChartRows,
  hasTransactionLevelData,
  chartUsesEstimatedData,
  type HeliosStatementPayload,
} from "./analysisAdapter";

const rollupPayload: HeliosStatementPayload = {
  data: {
    statement: {
      monthlyStatementSummaries: [
        {
          fileName: "dec.pdf",
          openingBalance: 1000,
          checksumOk: true,
          coveragePeriod: { startDate: "2024-12-01" },
        },
      ],
      analysis: {
        chartActivity: {
          version: 1,
          openingBalance: 1000,
          daily: [
            {
              date: "2024-12-02",
              deposits: 100,
              withdrawals: 40,
              net: 60,
              txnCount: 2,
              balance: 1060,
            },
            {
              date: "2024-12-03",
              deposits: 50,
              withdrawals: 0,
              net: 50,
              txnCount: 1,
              balance: 1110,
            },
          ],
          weekly: [
            {
              weekKey: "2024-W49",
              date: "2024-12-03",
              deposits: 150,
              withdrawals: 40,
              net: 110,
              txnCount: 3,
              balance: 1110,
            },
          ],
          sourceTxnCount: 3,
        },
        metadata: { parseOutcome: "OK", institutionProfileGate: { productionReady: true } },
      },
      transactions: [],
    },
    transactions: [],
  },
};

describe("chartActivity rollup fallback", () => {
  it("hasTransactionLevelData is true when chartActivity daily exists", () => {
    expect(hasTransactionLevelData(rollupPayload)).toBe(true);
  });

  it("buildChartRows daily uses rollup when transactions array empty", () => {
    const rows = buildChartRows(rollupPayload, "daily");
    expect(rows.length).toBe(2);
    expect(rows[0].deposits).toBe(100);
    expect(rows[0].txnCount).toBe(2);
  });

  it("buildChartRows weekly uses rollup when transactions array empty", () => {
    const rows = buildChartRows(rollupPayload, "weekly");
    expect(rows.length).toBe(1);
    expect(rows[0].net).toBe(110);
  });

  it("chartUsesEstimatedData is false for daily when rollup present and checksum trusted", () => {
    expect(chartUsesEstimatedData(rollupPayload, "daily")).toBe(false);
  });
});
