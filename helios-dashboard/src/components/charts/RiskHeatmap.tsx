"use client";

import { Treemap, ResponsiveContainer, Tooltip } from "recharts";
import type { HeliosStatementPayload } from "@/lib/analysisAdapter";
import {
  buildFeeTreemapNodes,
  getFeeTransactionsFromPayload,
  MOCK_FEE_TRANSACTIONS,
} from "@/lib/feeActivityAdapter";
type Props = {
  payload: HeliosStatementPayload;
  useMockWhenEmpty?: boolean;
  onCategoryClick?: (category: string) => void;
  /** Skip outer card chrome when nested inside WidgetShell. */
  embedded?: boolean;
};

function FeeTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload?: { name?: string; size?: number } }>;
}) {
  if (!active || !payload?.[0]?.payload) return null;
  const p = payload[0].payload;
  return (
    <div className="rounded-lg border border-sky-200 bg-white px-3 py-2 text-sm shadow-md">
      <p className="font-semibold text-slate-800">{p.name}</p>
      <p className="text-sky-600">${Number(p.size ?? 0).toLocaleString()}</p>
    </div>
  );
}

export default function RiskHeatmap({
  payload,
  useMockWhenEmpty = true,
  onCategoryClick,
  embedded = false,
}: Props) {
  let fees = getFeeTransactionsFromPayload(payload as HeliosStatementPayload);
  if (!fees.length && useMockWhenEmpty) fees = MOCK_FEE_TRANSACTIONS;

  const nodes = buildFeeTreemapNodes(fees);

  const body =
    nodes.length === 0 ? (
      <p className="py-8 text-center text-sm text-slate-500">No fee data available.</p>
    ) : (
      <div className={embedded ? "h-full min-h-[200px] w-full" : "mt-4 h-[280px] w-full"}>
        <ResponsiveContainer width="100%" height="100%">
          <Treemap
            data={nodes}
            dataKey="size"
            nameKey="name"
            aspectRatio={4 / 3}
            stroke="#fff"
            fill="#0ea5e9"
            onClick={(node) => {
              const cat = (node as { category?: string }).category;
              if (cat && onCategoryClick) onCategoryClick(cat);
            }}
          >
            <Tooltip content={<FeeTooltip />} />
          </Treemap>
        </ResponsiveContainer>
      </div>
    );

  if (embedded) {
    return (
      <div className="flex h-full min-h-0 flex-col">
        <p className="mb-2 text-[11px] text-sky-600 dark:text-sky-400">
          Treemap sized by fee amount — NSF, overdraft, service charges
        </p>
        {body}
      </div>
    );
  }

  return (
    <section className="helios-card border-sky-200 bg-sky-50 p-4 sm:p-6 dark:border-sky-800 dark:bg-sky-950/30">
      <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
        Fee risk heatmap
      </h2>
      <p className="mt-1 text-xs text-sky-600 dark:text-sky-400">
        Treemap sized by fee amount — NSF, overdraft, service charges
      </p>
      {body}
    </section>
  );
}
