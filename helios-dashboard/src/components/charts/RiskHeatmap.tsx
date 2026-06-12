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
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm shadow-md">
      <p className="font-semibold">{p.name}</p>
      <p>${Number(p.size ?? 0).toLocaleString()}</p>
    </div>
  );
}

export default function RiskHeatmap({
  payload,
  useMockWhenEmpty = true,
  onCategoryClick,
}: Props) {
  let fees = getFeeTransactionsFromPayload(payload as HeliosStatementPayload);
  if (!fees.length && useMockWhenEmpty) fees = MOCK_FEE_TRANSACTIONS;

  const nodes = buildFeeTreemapNodes(fees);

  return (
    <section className="helios-card p-4 sm:p-6">
      <h2 className="text-lg font-semibold text-slate-900">Fee risk heatmap</h2>
      <p className="mt-1 text-xs text-slate-500">
        Treemap sized by fee amount — NSF, overdraft, service charges
      </p>
      {nodes.length === 0 ? (
        <p className="py-12 text-center text-sm text-slate-500">No fee data available.</p>
      ) : (
        <div className="mt-4 h-[280px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <Treemap
              data={nodes}
              dataKey="size"
              nameKey="name"
              aspectRatio={4 / 3}
              stroke="#fff"
              fill="#8884d8"
              onClick={(node) => {
                const cat = (node as { category?: string }).category;
                if (cat && onCategoryClick) onCategoryClick(cat);
              }}
            >
              <Tooltip content={<FeeTooltip />} />
            </Treemap>
          </ResponsiveContainer>
        </div>
      )}
    </section>
  );
}
