"use client";

import {
  formatCurrency,
  getSpendingWindowSummary,
  type HeliosStatementPayload,
} from "@/lib/analysisAdapter";

type Props = {
  payload: HeliosStatementPayload;
  parseTrusted?: boolean;
};

export default function SpendingMetricsPanel({ payload, parseTrusted = true }: Props) {
  const window = getSpendingWindowSummary(payload);
  const vitals = payload.data?.statement?.analysis?.underwritingVitals;
  const l3mAdb = vitals?.adb?.l3mAverage ?? null;
  const depositConsistency =
    payload.data?.statement?.analysis?.forensicIntelligence?.depositConsistencyScore ?? null;

  if (!window) {
    return (
      <section className="helios-card p-4 sm:p-6">
        <h2 className="text-lg font-semibold text-slate-900">Spending metrics</h2>
        <p className="mt-2 text-sm text-slate-500">No activity window data for this analysis.</p>
      </section>
    );
  }

  const untrusted = !parseTrusted;
  const reconciliation = window.reconciliation;
  const reconciliationFailed = reconciliation?.withinTolerance === false;

  return (
    <section className="helios-card p-4 sm:p-6">
      <h2 className="text-lg font-semibold text-slate-900">Spending metrics (L3M)</h2>
      {reconciliationFailed && (
        <p className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          Chart totals differ from statement summaries by{" "}
          {formatCurrency(Math.abs(reconciliation?.deltaDeposits ?? 0))} deposits /{" "}
          {formatCurrency(Math.abs(reconciliation?.deltaWithdrawals ?? 0))} withdrawals — review parse.
        </p>
      )}
      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Metric
          label="Avg daily deposits"
          value={untrusted ? "—" : formatCurrency(window.avgDailyDeposits ?? null)}
          hint={
            !untrusted && window.calendarDays != null
              ? `${window.calendarDays} calendar days`
              : undefined
          }
        />
        <Metric
          label="Avg daily withdrawals"
          value={untrusted ? "—" : formatCurrency(window.avgDailyWithdrawals ?? null)}
          hint={
            !untrusted && window.calendarDays != null
              ? `${window.calendarDays} calendar days`
              : undefined
          }
        />
        <Metric label="Avg txns / day" value={untrusted ? "—" : (window.avgTxnPerDay ?? 0).toFixed(1)} />
        <Metric label="L3M net cash flow" value={untrusted ? "—" : formatCurrency(window.net ?? null)} />
        <Metric label="L3M ADB" value={untrusted ? "—" : formatCurrency(l3mAdb)} />
        <Metric
          label="Deposit consistency"
          value={untrusted || depositConsistency == null ? "—" : `${Math.round(depositConsistency)}%`}
        />
      </div>
    </section>
  );
}

function Metric({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-lg font-bold text-slate-900">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-slate-500">{hint}</p>}
    </div>
  );
}
