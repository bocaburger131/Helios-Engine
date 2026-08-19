"use client";

import { useMemo } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import WidgetShell from "@/components/widgets/WidgetShell";
import { formatCurrency, type HeliosStatementPayload } from "@/lib/analysisAdapter";
import { buildMonthlyProjections } from "@/lib/ProjectionsEngine";

type Props = {
  payload: HeliosStatementPayload;
  minimized: boolean;
  onToggleMinimize: () => void;
  editable?: boolean;
};

export default function WidgetRollingAverage({
  payload,
  minimized,
  onToggleMinimize,
  editable = false,
}: Props) {
  const rows = useMemo(() => buildMonthlyProjections(payload, 3), [payload]);
  const chartData = useMemo(
    () =>
      rows.map((r) => ({
        label: r.label,
        net: r.net,
        projected: Boolean(r.projected),
      })),
    [rows]
  );

  return (
    <WidgetShell
      title="Rolling 3-Month Average"
      minimized={minimized}
      onToggleMinimize={onToggleMinimize}
      variant="results"
      editable={editable}
    >
      {chartData.length === 0 ? (
        <p className="text-sm text-slate-500">No monthly series available.</p>
      ) : (
        <div className="flex h-full min-h-[200px] flex-col">
          <p className="mb-2 text-[11px] text-sky-600 dark:text-sky-400">
            L3M moving average of net cash flow (projected bar highlighted)
          </p>
          <div className="min-h-0 flex-1">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#bae6fd" />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 10, fill: "#0369a1" }}
                  interval={0}
                />
                <YAxis
                  tick={{ fontSize: 10, fill: "#0369a1" }}
                  tickFormatter={(v) =>
                    typeof v === "number"
                      ? `${v >= 0 ? "" : "-"}$${Math.abs(v / 1000).toFixed(0)}k`
                      : String(v)
                  }
                />
                <Tooltip
                  formatter={(value) => formatCurrency(Number(value))}
                  contentStyle={{
                    borderRadius: 8,
                    borderColor: "#7dd3fc",
                    fontSize: 12,
                  }}
                />
                <Bar
                  dataKey="net"
                  name="Net"
                  radius={[4, 4, 0, 0]}
                  fill="#0ea5e9"
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </WidgetShell>
  );
}
