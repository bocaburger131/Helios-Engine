"use client";

import Link from "next/link";
import {
  formatAnalysisTimestampEst,
  getAnalysisTimestamp,
  type HeliosStatementPayload,
} from "@/lib/analysisAdapter";

type Props = {
  payload: HeliosStatementPayload;
  statementId: string;
  onViewJson?: () => void;
};

export default function AnalysisTimestampBar({
  payload,
  statementId,
  onViewJson,
}: Props) {
  const raw = getAnalysisTimestamp(payload);
  const formatted = formatAnalysisTimestampEst(raw);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm dark:border-slate-800 dark:bg-slate-950">
      <div className="flex min-w-0 flex-wrap items-center gap-3 sm:gap-4">
        <Link
          href="/results"
          className="shrink-0 text-sm font-medium text-[#3366a9] hover:underline"
        >
          ← Back to results
        </Link>
        <div className="hidden h-4 w-px bg-slate-200 sm:block dark:bg-slate-700" />
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Analysis Timestamp
          </p>
          <p className="truncate font-mono text-sm font-semibold text-slate-900 dark:text-slate-100">
            {formatted}
          </p>
        </div>
        <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200">
          Engine v3.0 • Verified
        </span>
      </div>
      <div className="flex items-center gap-2">
        <span className="hidden font-mono text-[10px] text-slate-400 sm:inline">
          {statementId.slice(0, 12)}
          {statementId.length > 12 ? "…" : ""}
        </span>
        {onViewJson && (
          <button
            type="button"
            onClick={onViewJson}
            className="helios-btn helios-btn-secondary py-1.5 text-xs dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
          >
            View JSON
          </button>
        )}
      </div>
    </div>
  );
}
