"use client";

import { formatCurrency, type EnvelopeViewModel } from "@/lib/envelopeAdapter";

type Props = {
  view: EnvelopeViewModel;
};

function MetricTile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="helios-card p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-2 text-xl font-bold text-slate-900">{value}</p>
      {sub && <p className="mt-1 text-xs text-slate-500">{sub}</p>}
    </div>
  );
}

export default function MetricsRow({ view }: Props) {
  const m = view.metrics;
  const untrusted = !view.parseTrusted;
  const value = (v: string) => (untrusted ? "—" : v);
  const sub = untrusted ? "unverified parse" : undefined;
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
      <MetricTile label="L3M ADB" value={value(formatCurrency(m.l3mAdb))} sub={sub} />
      <MetricTile
        label="NSF / OD"
        value={value(m.nsfCount != null ? String(m.nsfCount) : "—")}
        sub={sub}
      />
      <MetricTile label="DSCR" value={value(m.dscr != null ? m.dscr.toFixed(2) : "—")} sub={sub} />
      <MetricTile
        label="Days cash"
        value={value(m.daysCashOnHand != null ? String(m.daysCashOnHand) : "—")}
        sub={untrusted ? "unverified parse" : "on hand"}
      />
      <MetricTile
        label="Checksum pass rate"
        value={value(m.consistencyScore != null ? `${m.consistencyScore}%` : "—")}
        sub={untrusted ? "unverified parse" : "statement reconciliation"}
      />
    </div>
  );
}
