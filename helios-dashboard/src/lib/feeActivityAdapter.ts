/**
 * Roll up feeTransactions from analysis payload for RiskHeatmap.
 */

import type { HeliosStatementPayload } from "@/lib/analysisAdapter";

export type FeeTransaction = {
  date?: string;
  description?: string;
  amount?: number;
  category?: string;
  pageIndex?: number | null;
  bbox?: { x: number; y: number; w: number; h: number } | null;
};

export type FeeTreemapNode = {
  name: string;
  size: number;
  category: string;
  fill?: string;
  children?: FeeTreemapNode[];
};

const CATEGORY_COLORS: Record<string, string> = {
  NSF: "#dc2626",
  Overdraft: "#ea580c",
  "Service Charge": "#2563eb",
  "Transfer Fee": "#7c3aed",
  "Other Fee": "#64748b",
};

export function getFeeTransactionsFromPayload(
  payload: HeliosStatementPayload
): FeeTransaction[] {
  const summaries = payload.data?.statement?.monthlyStatementSummaries ?? [];
  const fromSummaries = summaries.flatMap(
    (s) => (s as { feeTransactions?: FeeTransaction[] }).feeTransactions ?? []
  );
  if (fromSummaries.length > 0) return fromSummaries;

  const analysisFees =
    (payload.data?.statement?.analysis as { feeTransactions?: FeeTransaction[] })
      ?.feeTransactions ?? [];
  return analysisFees;
}

export function buildFeeTreemapNodes(fees: FeeTransaction[]): FeeTreemapNode[] {
  const byCategory = new Map<string, number>();

  for (const f of fees) {
    const cat = f.category || "Other Fee";
    const amt = Math.abs(Number(f.amount) || 0);
    if (amt <= 0) continue;
    byCategory.set(cat, (byCategory.get(cat) ?? 0) + amt);
  }

  if (byCategory.size === 0) return [];

  return Array.from(byCategory.entries()).map(([category, size]) => ({
    name: category,
    size,
    category,
    fill: CATEGORY_COLORS[category] ?? CATEGORY_COLORS["Other Fee"],
  }));
}

export function hasFeeData(payload: HeliosStatementPayload): boolean {
  return getFeeTransactionsFromPayload(payload).length > 0;
}

/** Mock fees for skeleton/dev when API field not yet populated */
export const MOCK_FEE_TRANSACTIONS: FeeTransaction[] = [
  { date: "2023-12-15", description: "NSF FEE", amount: 35, category: "NSF" },
  { date: "2023-12-20", description: "MONTHLY FEE", amount: 10, category: "Service Charge" },
  { date: "2024-01-05", description: "OVERDRAFT FEE", amount: 34, category: "Overdraft" },
];
