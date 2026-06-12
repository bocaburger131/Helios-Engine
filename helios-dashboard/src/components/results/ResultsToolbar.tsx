"use client";

import Link from "next/link";

type Props = {
  statementId: string;
  onViewJson?: () => void;
};

export default function ResultsToolbar({ statementId, onViewJson }: Props) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--helios-border)] pb-4">
      <Link href="/results" className="text-sm text-blue-600 hover:underline">
        ← Back to results
      </Link>
      <div className="flex flex-wrap items-center gap-3">
        {onViewJson && (
          <button
            type="button"
            onClick={onViewJson}
            className="helios-btn helios-btn-secondary py-1.5 text-xs"
          >
            View JSON
          </button>
        )}
        <span className="font-mono text-xs text-slate-500">{statementId}</span>
      </div>
    </div>
  );
}
