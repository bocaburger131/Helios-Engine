import { describe, it, expect } from "vitest";
import {
  buildFeeTreemapNodes,
  getFeeTransactionsFromPayload,
  MOCK_FEE_TRANSACTIONS,
} from "./feeActivityAdapter";
import type { HeliosStatementPayload } from "./analysisAdapter";

describe("feeActivityAdapter", () => {
  it("rolls up fee transactions from monthly summaries", () => {
    const payload = {
      data: {
        statement: {
          monthlyStatementSummaries: [
            {
              feeTransactions: [{ amount: 35, category: "NSF" }],
            },
          ],
        },
      },
    } as HeliosStatementPayload;

    expect(getFeeTransactionsFromPayload(payload)).toHaveLength(1);
    const nodes = buildFeeTreemapNodes(getFeeTransactionsFromPayload(payload));
    expect(nodes[0].size).toBe(35);
    expect(nodes[0].category).toBe("NSF");
  });

  it("builds treemap nodes from mock fees", () => {
    const nodes = buildFeeTreemapNodes(MOCK_FEE_TRANSACTIONS);
    expect(nodes.length).toBeGreaterThan(0);
    expect(nodes.reduce((s, n) => s + n.size, 0)).toBeGreaterThan(0);
  });
});
