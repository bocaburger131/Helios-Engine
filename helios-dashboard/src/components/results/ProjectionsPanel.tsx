"use client";

import { useMemo, useState } from "react";
import { formatCurrency, type HeliosStatementPayload } from "@/lib/analysisAdapter";
import { buildMonthlyProjections } from "@/lib/ProjectionsEngine";
import { computeEligibility, type EligibilityBand } from "@/lib/EligibilityCalculator";

const BAND_STYLE: Record<EligibilityBand, string> = {
  Strong: "bg-emerald-100 text-emerald-800",
  Moderate: "bg-blue-100 text-blue-800",
  Weak: "bg-amber-100 text-amber-900",
  Ineligible: "bg-rose-100 text-rose-800",
  Unreliable: "bg-slate-200 text-slate-700",
};

type Props = {
  payload: HeliosStatementPayload;
};

export default function ProjectionsPanel({ payload }: Props) {
  const projections = useMemo(() => buildMonthlyProjections(payload), [payload]);
  const [loanAmount, setLoanAmount] = useState<number | "">(
    payload.data?.statement?.applicationContext?.requestedLoanAmount ?? ""
  );

  const eligibility = useMemo(
    () =>
      computeEligibility(
        payload,
        loanAmount === "" ? null : Number(loanAmount)
      ),
    [payload, loanAmount]
  );

  return (
    <section className="helios-card p-4 sm:p-6">
      <h2 className="text-lg font-semibold text-slate-900">Projections & eligibility</h2>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div>
          <h3 className="text-sm font-medium text-slate-700">L3M moving average</h3>
          <ul className="mt-2 space-y-1 text-sm">
            {projections.map((row) => (
              <li
                key={row.monthKey}
                className={`flex justify-between ${row.projected ? "text-blue-700 font-medium" : "text-slate-700"}`}
              >
                <span>{row.label}</span>
                <span>{formatCurrency(row.net)} net</span>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700">
            Requested loan amount
            <input
              type="number"
              value={loanAmount}
              onChange={(e) =>
                setLoanAmount(e.target.value === "" ? "" : Number(e.target.value))
              }
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </label>
          <dl className="mt-4 space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-slate-600">Proposed DSCR</dt>
              <dd className="font-semibold">
                {eligibility.dscr != null ? eligibility.dscr.toFixed(2) : "—"}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-600">Monthly net (L3M)</dt>
              <dd>{formatCurrency(eligibility.monthlyNetCashFlow)}</dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-slate-600">Eligibility</dt>
              <dd>
                <span className={`helios-chip ${BAND_STYLE[eligibility.band]}`}>
                  {eligibility.band}
                </span>
              </dd>
            </div>
          </dl>
        </div>
      </div>
    </section>
  );
}
