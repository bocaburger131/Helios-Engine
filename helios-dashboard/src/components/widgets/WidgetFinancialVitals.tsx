"use client";

import WidgetShell from "@/components/widgets/WidgetShell";
import { formatCurrency, type EnvelopeViewModel } from "@/lib/envelopeAdapter";
import type { HeliosStatementPayload } from "@/lib/analysisAdapter";
import type { CategorizerVitals } from "@/lib/recalcCategorizerVitals";

type Props = {
  view: EnvelopeViewModel;
  payload: HeliosStatementPayload;
  categorizerVitals?: CategorizerVitals | null;
  minimized: boolean;
  onToggleMinimize: () => void;
  editable?: boolean;
};

function Tile({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-lg border border-[#d6e8ff] bg-[#f3f8ff] px-3 py-2 dark:border-slate-700 dark:bg-slate-900">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-[#3366a9]">
        {label}
      </p>
      <p className="mt-1 font-mono text-base font-bold text-slate-900 dark:text-slate-100">
        {value}
      </p>
    </div>
  );
}

export default function WidgetFinancialVitals({
  view,
  payload,
  categorizerVitals,
  minimized,
  onToggleMinimize,
  editable = false,
}: Props) {
  const m = view.metrics;
  const totals = payload.data?.statement?.analysis?.financialTotals;
  const deposits = totals?.totalDeposits;
  const withdrawals = totals?.totalWithdrawals;
  const fallbackNet =
    deposits != null &&
    withdrawals != null &&
    Number.isFinite(deposits) &&
    Number.isFinite(withdrawals)
      ? deposits - withdrawals
      : null;

  const netCash =
    categorizerVitals != null
      ? categorizerVitals.netCashFlow
      : fallbackNet;

  return (
    <WidgetShell
      title="Financial Vitals"
      minimized={minimized}
      onToggleMinimize={onToggleMinimize}
      variant="results"
      editable={editable}
    >
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <Tile
          label="True Monthly Revenue"
          value={
            categorizerVitals
              ? formatCurrency(categorizerVitals.trueMonthlyRevenue)
              : "—"
          }
        />
        <Tile
          label="Total OpEx"
          value={
            categorizerVitals
              ? formatCurrency(categorizerVitals.totalOpex)
              : "—"
          }
        />
        <Tile
          label="Total COGS"
          value={
            categorizerVitals
              ? formatCurrency(categorizerVitals.totalCogs)
              : "—"
          }
        />
        <Tile label="Net Cash Flow" value={formatCurrency(netCash)} />
        <Tile label="L3M ADB" value={formatCurrency(m.l3mAdb)} />
        <Tile
          label="NSF Count"
          value={m.nsfCount != null ? String(m.nsfCount) : "—"}
        />
        <Tile
          label="DSCR"
          value={m.dscr != null ? m.dscr.toFixed(2) : "—"}
        />
        <Tile
          label="Days Cash"
          value={m.daysCashOnHand != null ? String(m.daysCashOnHand) : "—"}
        />
        <Tile
          label="Consistency"
          value={
            m.consistencyScore != null ? `${m.consistencyScore}%` : "—"
          }
        />
      </div>
    </WidgetShell>
  );
}
