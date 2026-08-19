"use client";

import { useState, useMemo } from "react";

type Props = {
  payload: {
    checksumDelta: number;
    extractedRows: Array<Record<string, unknown>>;
    runId?: string;
  };
};

type YearAssignment = "previous" | "current" | "unassigned";

function pickLabel(row: Record<string, unknown>, candidates: string[]): string {
  for (const key of candidates) {
    const val = row[key];
    if (val !== undefined && val !== null) return String(val);
  }
  return "—";
}

function pickAmount(row: Record<string, unknown>): number {
  for (const key of ["amount", "value", "transactionAmount", "valueAmount"]) {
    const val = row[key];
    if (val !== undefined && val !== null) {
      const n = Number(val);
      if (!Number.isNaN(n)) return n;
    }
  }
  return 0;
}

export default function HitlDateFix({ payload }: Props) {
  const rows = payload.extractedRows;
  const [assignments, setAssignments] = useState<YearAssignment[]>(
    () => new Array(rows.length).fill("unassigned")
  );

  const allAssigned = assignments.every((a) => a !== "unassigned");

  const toggleYear = (index: number) => {
    setAssignments((prev) => {
      const next = [...prev];
      const order: YearAssignment[] = ["previous", "current", "unassigned"];
      const current = next[index] ?? "unassigned";
      const nextIdx = (order.indexOf(current) + 1) % order.length;
      next[index] = order[nextIdx];
      return next;
    });
  };

  const counts = useMemo(() => {
    const c = { previous: 0, current: 0 };
    assignments.forEach((a) => {
      if (a in c) c[a as keyof typeof c]++;
    });
    return c;
  }, [assignments]);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-sm font-semibold">
        <span className="text-orange-500">&#128197;</span>
        Date rollover detected — assign each row to the correct year
      </div>

      <div className="flex gap-4 text-xs font-medium text-slate-500">
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-2 rounded-full bg-amber-500" />
          Previous Year ({counts.previous})
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" />
          Current Year ({counts.current})
        </span>
      </div>

      <div className="space-y-2 max-h-[280px] overflow-y-auto pr-1">
        {rows.map((row, i) => {
          const date = pickLabel(row, ["date", "transactionDate"]);
          const desc = pickLabel(row, ["description", "memo", "narrative"]);
          const amt = pickAmount(row);
          const assignment = assignments[i] ?? "unassigned";

          return (
            <div
              key={i}
              className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3 shadow-sm"
            >
              <div className="min-w-[80px] text-xs font-mono text-slate-500">
                {date}
              </div>
              <div className="flex-1 min-w-0 truncate text-sm text-slate-800">
                {desc}
              </div>
              <div className="min-w-[70px] text-right text-sm font-mono font-semibold text-slate-700">
                {amt !== 0
                  ? (amt < 0 ? "−" : "+") +
                    " $" +
                    Math.abs(amt).toLocaleString(undefined, {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })
                  : "—"}
              </div>
              <div className="flex gap-1">
                <button
                  type="button"
                  onClick={() => toggleYear(i)}
                  className={`rounded-full px-2.5 py-0.5 text-xs font-semibold cursor-pointer select-none transition-colors ${
                    assignment === "previous"
                      ? "bg-amber-500 text-white shadow-sm"
                      : "bg-slate-100 text-slate-400 hover:bg-slate-200"
                  }`}
                >
                  Prev Year
                </button>
                <button
                  type="button"
                  onClick={() => toggleYear(i)}
                  className={`rounded-full px-2.5 py-0.5 text-xs font-semibold cursor-pointer select-none transition-colors ${
                    assignment === "current"
                      ? "bg-emerald-500 text-white shadow-sm"
                      : "bg-slate-100 text-slate-400 hover:bg-slate-200"
                  }`}
                >
                  Current Year
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <button
        type="button"
        disabled={!allAssigned}
        className={`helios-btn helios-btn-primary w-full sm:w-auto ${
          !allAssigned ? "opacity-50 cursor-not-allowed" : ""
        }`}
      >
        {allAssigned ? "Confirm Year Assignments" : "Assign All Rows First"}
      </button>
    </div>
  );
}