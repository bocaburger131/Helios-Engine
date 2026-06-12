"use client";

import { formatCurrency, type EnvelopeViewModel } from "@/lib/envelopeAdapter";

type Props = {
  view: EnvelopeViewModel;
  statementId: string;
};

export default function HeroGrid({ view, statementId }: Props) {
  const variancePct = view.revenueVariancePct;
  const varianceWidth =
    variancePct != null ? Math.min(100, Math.abs(variancePct)) : 0;
  const varianceColor =
    variancePct == null
      ? "bg-slate-300"
      : Math.abs(variancePct) <= 10
        ? "bg-emerald-500"
        : variancePct > 0
          ? "bg-blue-500"
          : "bg-amber-500";

  return (
    <header className="space-y-4">
      <div className="grid gap-6 lg:grid-cols-[1fr_auto]">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Underwriting report
          </p>
          <h1 className="mt-1 text-2xl font-bold text-slate-900 sm:text-3xl">
            {view.companyName}
          </h1>
          {view.businessAddress && (
            <p className="mt-1 text-sm text-slate-600">{view.businessAddress}</p>
          )}
          <p className="mt-2 text-sm text-slate-600">
            {view.bankName} · Account {view.accountNumber}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {view.dealId && <span className="helios-chip">Deal {view.dealId}</span>}
            {view.requestedLoanAmount != null && (
              <span className="helios-chip bg-blue-50 text-blue-800">
                Requested {formatCurrency(view.requestedLoanAmount)}
              </span>
            )}
            {view.statedRevenue != null && (
              <span className="helios-chip">
                Stated rev {formatCurrency(view.statedRevenue)}/yr
              </span>
            )}
            <span className="helios-chip font-mono text-slate-500">{statementId}</span>
          </div>
        </div>
      </div>

      {variancePct != null && (
        <div className="helios-card p-4">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium text-slate-700">Revenue variance</span>
            <span className="text-slate-600">
              {view.revenueVarianceLabel} ({variancePct > 0 ? "+" : ""}
              {variancePct}%)
            </span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
            <div
              className={`h-full rounded-full transition-all ${varianceColor}`}
              style={{ width: `${varianceWidth}%` }}
            />
          </div>
        </div>
      )}
    </header>
  );
}
