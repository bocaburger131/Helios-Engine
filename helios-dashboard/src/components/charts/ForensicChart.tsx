"use client";

import { useMemo, useState } from "react";
import {
  Area,
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  buildChartRows,
  chartUsesEstimatedData,
  formatCurrency,
  getMonthOptions,
  hasTransactionLevelData,
  usesRollupOnlyTransactions,
  type HeliosStatementPayload,
  type Horizon,
} from "@/lib/analysisAdapter";

const HORIZONS: { id: Horizon; label: string }[] = [
  { id: "daily", label: "Daily" },
  { id: "weekly", label: "Weekly" },
  { id: "monthly", label: "Monthly" },
  { id: "l3m", label: "L3M" },
  { id: "quarterly", label: "Quarterly" },
];

export type ChartMode = "cashFlow" | "liquidity" | "netVelocity";

const MODES: { id: ChartMode; label: string; title: string }[] = [
  { id: "cashFlow", label: "Cash Flow", title: "Cash flow" },
  { id: "liquidity", label: "Liquidity", title: "Average daily balance" },
  { id: "netVelocity", label: "Net Velocity", title: "Net velocity" },
];

type Props = {
  payload: HeliosStatementPayload;
  defaultHorizon?: Horizon;
  showMonthDrill?: boolean;
  compact?: boolean;
};

function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ name?: string; value?: number; color?: string; payload?: { txnCount?: number } }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  const txnCount = payload[0]?.payload?.txnCount;
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm shadow-md">
      <p className="mb-1 font-semibold text-slate-800">{label}</p>
      {payload.map((entry) => (
        <p key={entry.name} style={{ color: entry.color }} className="text-slate-700">
          {entry.name}: {formatCurrency(entry.value ?? null)}
        </p>
      ))}
      {txnCount != null && txnCount > 0 && (
        <p className="mt-1 text-xs text-slate-500">{txnCount} transactions</p>
      )}
    </div>
  );
}

function isTxnHorizon(h: Horizon): boolean {
  return h === "daily" || h === "weekly";
}

export default function ForensicChart({
  payload,
  defaultHorizon = "daily",
  showMonthDrill = true,
  compact = false,
}: Props) {
  const monthOptions = useMemo(() => getMonthOptions(payload), [payload]);
  const hasTxns = hasTransactionLevelData(payload);

  const [chartMode, setChartMode] = useState<ChartMode>("cashFlow");
  const [horizon, setHorizon] = useState<Horizon>(() =>
    hasTxns ? "daily" : defaultHorizon === "daily" ? "l3m" : defaultHorizon
  );
  const [selectedMonthKey, setSelectedMonthKey] = useState(
    () => monthOptions[monthOptions.length - 1]?.monthKey ?? ""
  );

  const selectMode = (mode: ChartMode) => {
    setChartMode(mode);
    if (hasTxns && !isTxnHorizon(horizon)) {
      setHorizon("daily");
    }
  };

  const chartRows = useMemo(
    () => buildChartRows(payload, horizon, selectedMonthKey),
    [payload, horizon, selectedMonthKey]
  );

  const estimated = chartUsesEstimatedData(payload, horizon);
  const modeMeta = MODES.find((m) => m.id === chartMode) ?? MODES[0];

  const emptyMessage =
    isTxnHorizon(horizon) && !hasTxns
      ? "No transaction-level data — upload a completed batch analysis."
      : isTxnHorizon(horizon) && usesRollupOnlyTransactions(payload)
        ? "Showing daily rollup — re-upload for per-transaction drill-down."
        : "No monthly statement data available for this analysis.";

  const showSecondAxis =
    chartMode === "cashFlow" &&
    chartRows.some((r) => r.adb != null && !isTxnHorizon(horizon));

  return (
    <section className={`helios-card ${compact ? "p-4" : "p-4 sm:p-6"}`}>
      <div className="mb-4 flex flex-col gap-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">{modeMeta.title}</h2>
            {estimated && (
              <p className="mt-1 text-xs text-amber-700">
                Unreliable or estimated — checksum failed or no transaction detail
              </p>
            )}
          </div>
          <div
            className="inline-flex flex-wrap rounded-full bg-slate-100 p-1"
            role="tablist"
            aria-label="Chart time horizon"
          >
            {HORIZONS.map(({ id, label }) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={horizon === id}
                onClick={() => setHorizon(id)}
                className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors sm:px-4 sm:py-2 sm:text-sm ${
                  horizon === id
                    ? "bg-white text-slate-900 shadow-sm"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div
          className="inline-flex flex-wrap rounded-lg border border-slate-200 bg-slate-50 p-1"
          role="tablist"
          aria-label="Forensic chart mode"
        >
          {MODES.map(({ id, label }) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={chartMode === id}
              onClick={() => selectMode(id)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors sm:px-4 sm:text-sm ${
                chartMode === id
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {showMonthDrill &&
        (horizon === "daily" || horizon === "single") &&
        monthOptions.length > 0 && (
          <div className="mb-4">
            <label htmlFor="month-drill" className="mb-1 block text-sm font-medium text-slate-700">
              Drill-down month
            </label>
            <select
              id="month-drill"
              value={selectedMonthKey}
              onChange={(e) => {
                setSelectedMonthKey(e.target.value);
                if (horizon !== "daily") setHorizon("daily");
              }}
              className="w-full max-w-md rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
            >
              {monthOptions.map((opt) => (
                <option key={opt.monthKey} value={opt.monthKey}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        )}

      {chartRows.length === 0 ? (
        <p className="py-12 text-center text-slate-500">{emptyMessage}</p>
      ) : (
        <div className={compact ? "h-[320px] min-h-[320px] w-full min-w-0" : "h-[420px] min-h-[420px] w-full min-w-0"}>
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chartRows} margin={{ top: 12, right: 24, left: 8, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis
                dataKey="label"
                tick={{ fill: "#64748b", fontSize: 11 }}
                axisLine={{ stroke: "#cbd5e1" }}
                interval={horizon === "daily" ? "preserveStartEnd" : 0}
              />
              <YAxis
                yAxisId="left"
                tickFormatter={(v) => formatCurrency(v)}
                tick={{ fill: "#64748b", fontSize: 11 }}
                width={88}
              />
              {showSecondAxis && (
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  tickFormatter={(v) => formatCurrency(v)}
                  tick={{ fill: "#2563eb", fontSize: 11 }}
                  width={88}
                />
              )}
              <Tooltip content={<ChartTooltip />} />
              <Legend />

              {chartMode === "cashFlow" && (
                <>
                  <Bar
                    yAxisId="left"
                    dataKey="deposits"
                    name="Deposits"
                    fill="#16a34a"
                    radius={[4, 4, 0, 0]}
                    maxBarSize={48}
                  />
                  <Bar
                    yAxisId="left"
                    dataKey="withdrawals"
                    name="Withdrawals"
                    fill="#dc2626"
                    radius={[4, 4, 0, 0]}
                    maxBarSize={48}
                  />
                  {!isTxnHorizon(horizon) && (
                    <Line
                      yAxisId="right"
                      type="monotone"
                      dataKey="adb"
                      name="Avg Daily Balance"
                      stroke="#2563eb"
                      strokeWidth={2.5}
                      dot={{ r: 3 }}
                      connectNulls
                    />
                  )}
                </>
              )}

              {chartMode === "liquidity" && (
                <Line
                  yAxisId="left"
                  type="monotone"
                  dataKey={isTxnHorizon(horizon) ? "balance" : "adb"}
                  name={isTxnHorizon(horizon) ? "Daily balance" : "Avg Daily Balance"}
                  stroke="#2563eb"
                  strokeWidth={2.5}
                  dot={isTxnHorizon(horizon) ? { r: 2 } : { r: 3 }}
                  connectNulls
                />
              )}

              {chartMode === "netVelocity" && (
                <Area
                  yAxisId="left"
                  type="monotone"
                  dataKey="net"
                  name="Net cash flow"
                  stroke="#2563eb"
                  fill="#93c5fd"
                  fillOpacity={0.35}
                  strokeWidth={2}
                  dot={isTxnHorizon(horizon) ? { r: 2 } : false}
                  connectNulls
                />
              )}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}
    </section>
  );
}
