import { describe, it, expect } from "vitest";
import {
  buildChartRows,
  hasTransactionLevelData,
  chartUsesEstimatedData,
  resolveDefaultHorizon,
  type HeliosStatementPayload,
} from "./analysisAdapter";
import { filterDailyByL3mMonths, resolveL3mMonthKeys } from "./dailyActivityAdapter";
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

  it("resolveDefaultHorizon picks l3m for three statements", () => {
    const payload: HeliosStatementPayload = {
      data: {
        statement: {
          monthlyStatementSummaries: [
            { fileName: "a.pdf", coveragePeriod: { startDate: "2024-01-01" } },
            { fileName: "b.pdf", coveragePeriod: { startDate: "2024-02-01" } },
            { fileName: "c.pdf", coveragePeriod: { startDate: "2024-03-01" } },
          ],
        },
      },
    };
    expect(resolveDefaultHorizon(payload)).toBe("l3m");
  });

  it("buildChartRows l3m returns daily rows across three months", () => {
    const payload: HeliosStatementPayload = {
      data: {
        statement: {
          monthlyStatementSummaries: [
            {
              fileName: "jan.pdf",
              coveragePeriod: { startDate: "2024-01-01", endDate: "2024-01-31" },
            },
            {
              fileName: "feb.pdf",
              coveragePeriod: { startDate: "2024-02-01", endDate: "2024-02-29" },
            },
            {
              fileName: "mar.pdf",
              coveragePeriod: { startDate: "2024-03-01", endDate: "2024-03-31" },
            },
          ],
          analysis: {
            chartActivity: {
              version: 1,
              openingBalance: 1000,
              daily: [
                { date: "2024-01-05", deposits: 100, withdrawals: 0, net: 100, txnCount: 1, balance: 1100 },
                { date: "2024-02-10", deposits: 50, withdrawals: 20, net: 30, txnCount: 2, balance: 1130 },
                { date: "2024-03-15", deposits: 0, withdrawals: 30, net: -30, txnCount: 1, balance: 1100 },
                { date: "2024-04-01", deposits: 999, withdrawals: 0, net: 999, txnCount: 1, balance: 2099 },
              ],
              weekly: [],
              windows: {
                l3m: {
                  monthKeys: ["2024-01", "2024-02", "2024-03"],
                },
              },
              sourceTxnCount: 5,
            },
            metadata: { parseOutcome: "OK", institutionProfileGate: { productionReady: true } },
          },
          transactions: [],
        },
        transactions: [],
      },
    };

    const monthKeys = resolveL3mMonthKeys(payload);
    expect(monthKeys).toEqual(["2024-01", "2024-02", "2024-03"]);

    const rows = buildChartRows(payload, "l3m");
    expect(rows.length).toBe(3);
    expect(rows.some((r) => r.monthKey === "2024-04-01")).toBe(false);
    expect(rows.reduce((s, r) => s + r.deposits, 0)).toBe(150);
  });

  it("filterDailyByL3mMonths excludes months outside window", () => {
    const rows = [
      {
        date: "2024-01-05",
        label: "Jan 5",
        deposits: 10,
        withdrawals: 0,
        net: 10,
        txnCount: 1,
        balance: 10,
      },
      {
        date: "2024-04-01",
        label: "Apr 1",
        deposits: 99,
        withdrawals: 0,
        net: 99,
        txnCount: 1,
        balance: 109,
      },
    ];
    const filtered = filterDailyByL3mMonths(rows, ["2024-01", "2024-02", "2024-03"]);
    expect(filtered).toHaveLength(1);
    expect(filtered[0].date).toBe("2024-01-05");
  });
});
