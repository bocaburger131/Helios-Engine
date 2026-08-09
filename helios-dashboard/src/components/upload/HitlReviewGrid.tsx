"use client";

import { useState, useMemo, useCallback } from "react";
import type { ReviewPayload } from "./UploadChatLog";

type Category = "deposit" | "withdrawal" | "ignore";

type Props = {
  payload: ReviewPayload;
};

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

function pickDate(row: Record<string, unknown>): string {
  return pickLabel(row, ["date", "transactionDate", "txnDate", "postedDate"]);
}

function pickDescription(row: Record<string, unknown>): string {
  return pickLabel(row, ["description", "memo", "narrative", "payee", "name"]);
}

function resolveOpeningBalance(rows: Record<string, unknown>[]): number {
  for (const key of ["openingBalance", "opening", "startBalance", "startBalanceAmount"]) {
    const val = rows[0]?.[key];
    if (val !== undefined && val !== null) {
      const n = Number(val);
      if (!Number.isNaN(n)) return n;
    }
  }
  return 0;
}

export default function HitlReviewGrid({ payload }: Props) {
  const rows = payload.extractedRows;
  const [categories, setCategories] = useState<Category[]>(
    () => new Array(rows.length).fill("ignore")
  );

  const totals = useMemo(() => {
    let deposits = 0;
    let withdrawals = 0;
    rows.forEach((row, i) => {
      const amt = pickAmount(row);
      if (categories[i] === "deposit") deposits += amt;
      if (categories[i] === "withdrawal") withdrawals += amt;
    });
    return { deposits, withdrawals };
  }, [rows, categories]);

  const openingBalance = useMemo(() => resolveOpeningBalance(rows), [rows]);
  const expectedClosing = openingBalance + totals.deposits - totals.withdrawals;
  const delta = Math.round((expectedClosing - payload.checksumDelta) * 100) / 100;
  const isBalanced = delta === 0;

  const toggleCategory = useCallback(
    (index: number, cycle: Category) => {
      setCategories((prev) => {
        const next = [...prev];
        const order: Category[] = ["deposit", "withdrawal", "ignore"];
        const current = next[index] ?? "ignore";
        const nextIdx = (order.indexOf(current) + 1) % order.length;
        next[index] = order[nextIdx];
        return next;
      });
    },
    []
  );

  const COLOR_MAP: Record<string, { bg: string; text: string; activeBg: string; activeText: string }> = {
  emerald: {
    bg: "bg-emerald-600",
    text: "text-white",
    activeBg: "bg-emerald-600",
    activeText: "text-white",
  },
  rose: {
    bg: "bg-rose-600",
    text: "text-white",
    activeBg: "bg-rose-600",
    activeText: "text-white",
  },
  slate: {
    bg: "bg-slate-100",
    text: "text-slate-500",
    activeBg: "bg-slate-600",
    activeText: "text-white",
  },
};

const pillClass = (active: boolean, color: string) => {
  const c = COLOR_MAP[color] ?? COLOR_MAP.slate;
  return `rounded-full px-3 py-0.5 text-xs font-semibold transition-colors cursor-pointer select-none ${
    active ? `${c.activeBg} ${c.activeText} shadow-sm` : `${c.bg} ${c.text} hover:bg-slate-200`
  }`;
};

  const resolveRunId = payload.runId ?? "";

  const handleConfirm = useCallback(async () => {
    if (!isBalanced || !resolveRunId) return;
    const updatedRows = rows.map((row, i) => ({
      ...row,
      category: categories[i],
    }));
    try {
      const res = await fetch(
        `/api/processing-runs/${resolveRunId}/resolve`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ rows: updatedRows }),
        }
      );
      if (!res.ok) throw new Error(`Resolve failed (${res.status})`);
    } catch (e) {
      console.error("[HITL] Resolve error:", e);
    }
  }, [isBalanced, resolveRunId, rows, categories]);

  return (
    <div className="space-y-4">
      {/* Checksum Recalculator Banner */}
      <div
        className={`rounded-lg border px-4 py-3 text-sm ${
          isBalanced
            ? "border-emerald-300 bg-emerald-50 text-emerald-900"
            : "border-amber-300 bg-amber-50 text-amber-900"
        }`}
      >
        <div className="flex items-center gap-2 font-semibold">
          {isBalanced ? (
            <span className="text-emerald-600">&#10003;</span>
          ) : (
            <span className="text-amber-600">&#9888;</span>
          )}
          {isBalanced
            ? "Frontend checksum matches — ready to reconcile"
            : `Checksum delta: ${payload.checksumDelta}`}
        </div>
        <div className="mt-1 font-mono text-xs">
          Opening {openingBalance.toFixed(2)} + Deposits {totals.deposits.toFixed(2)} − Withdrawals {totals.withdrawals.toFixed(2)} = {expectedClosing.toFixed(2)}
        </div>
      </div>

      {/* Action Cards */}
      <div className="space-y-2 max-h-[320px] overflow-y-auto pr-1">
        {rows.map((row, i) => {
          const date = pickDate(row);
          const desc = pickDescription(row);
          const amt = pickAmount(row);
          const cat = categories[i] ?? "ignore";

          return (
            <div
              key={i}
              className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3 shadow-sm transition-shadow hover:shadow-md"
            >
              {/* Date */}
              <div className="min-w-[90px] text-xs font-mono text-slate-500">
                {date}
              </div>

              {/* Description */}
              <div className="flex-1 min-w-0 truncate text-sm text-slate-800">
                {desc}
              </div>

              {/* Amount */}
              <div className="min-w-[80px] text-right text-sm font-semibold font-mono text-slate-700">
                {amt !== 0
                  ? (amt < 0 ? "−" : "+") +
                    " $" +
                    Math.abs(amt).toLocaleString(undefined, {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })
                  : "—"}
              </div>

              {/* Toggle Pills */}
              <div className="flex gap-1">
                <button
                  type="button"
                  onClick={() => toggleCategory(i, "deposit")}
                  className={pillClass(cat === "deposit", "emerald")}
                  aria-label={`Mark as deposit`}
                >
                  Deposit
                </button>
                <button
                  type="button"
                  onClick={() => toggleCategory(i, "withdrawal")}
                  className={pillClass(cat === "withdrawal", "rose")}
                  aria-label={`Mark as withdrawal`}
                >
                  Withdrawal
                </button>
                <button
                  type="button"
                  onClick={() => toggleCategory(i, "ignore")}
                  className={pillClass(cat === "ignore", "slate")}
                  aria-label={`Ignore row`}
                >
                  Ignore
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Confirm & Reconcile */}
      <button
        type="button"
        onClick={handleConfirm}
        disabled={!isBalanced || !resolveRunId}
        className={`helios-btn helios-btn-primary w-full sm:w-auto ${
          !isBalanced || !resolveRunId
            ? "opacity-50 cursor-not-allowed"
            : ""
        }`}
      >
        Confirm &amp; Reconcile
      </button>
    </div>
  );
}