"use client";

import { formatCurrency, type EnvelopeViewModel, type VeritasBadge } from "@/lib/envelopeAdapter";

const BADGE_STYLE: Record<VeritasBadge, string> = {
  Pass: "bg-emerald-500/20 text-emerald-200",
  Review: "bg-amber-500/20 text-amber-200",
  Decline: "bg-rose-500/20 text-rose-200",
};

type Props = {
  view: EnvelopeViewModel;
};

export default function VeritasScoreCard({ view }: Props) {
  return (
    <div className="veritas-card p-6">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
        Veritas score
      </p>
      <div className="mt-3 flex items-end gap-3">
        <span className="text-4xl font-bold">
          {view.veritasScore != null ? view.veritasScore.toFixed(1) : "—"}
        </span>
        <span className={`helios-chip ${BADGE_STYLE[view.veritasBadge]}`}>
          {view.veritasBadge}
        </span>
      </div>
      <p className="mt-2 text-sm text-slate-300">{view.bankabilityLabel} bankability</p>
      {view.veraDecision && (
        <p className="mt-3 text-sm text-slate-400">
          Vera: <strong className="text-white">{view.veraDecision}</strong>
          {view.veraScore != null ? ` · ${view.veraScore}/10` : ""}
        </p>
      )}
      {view.metrics.l3mAdb != null && (
        <p className="mt-2 text-xs text-slate-500">
          L3M ADB {formatCurrency(view.metrics.l3mAdb)}
        </p>
      )}
    </div>
  );
}
