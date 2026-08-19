"use client";

import { useMemo, useRef, useState } from "react";
import type { HitlQueueItem } from "../helios-api";

type Props = {
  item: HitlQueueItem;
  onClose: () => void;
  onOpenHub: () => void;
};

function formatMoney(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return n.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/**
 * Dev Console HITL preview — PDF + checksum + transaction grid with micro-checksum flags.
 * Resolve remains in Upload Hub via onOpenHub deep-link.
 */
export default function HitlWorkspace({ item, onClose, onOpenHub }: Props) {
  const runSnippet =
    item.id && item.id.length > 12 ? `${item.id.slice(0, 8)}…` : item.id;
  const rowRefs = useRef<Record<number, HTMLTableRowElement | null>>({});
  const [selectedViolation, setSelectedViolation] = useState<number | null>(null);

  const violations = item.rowBalanceRecon?.violations || [];
  const failIndexes = useMemo(() => {
    const set = new Set<number>();
    for (const v of violations) {
      if (typeof v.rowIndex === "number") set.add(v.rowIndex);
    }
    return set;
  }, [violations]);

  const firstViolation = violations[0] || null;
  const transactions = Array.isArray(item.transactions) ? item.transactions : [];

  const jumpToViolation = (rowIndex: number) => {
    setSelectedViolation(rowIndex);
    const el = rowRefs.current[rowIndex];
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  return (
    <div className="flex h-full min-h-0 w-[520px] shrink-0 flex-col border-l border-slate-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex shrink-0 items-start justify-between gap-2 border-b border-amber-200 bg-amber-50 px-3 py-2.5 dark:border-amber-800 dark:bg-amber-950/50">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-amber-900 dark:text-amber-200">
            HITL preview
          </p>
          <p
            className="truncate text-sm font-medium text-slate-800 dark:text-zinc-100"
            title={item.fileName || undefined}
          >
            {item.fileName || "Unknown file"}
          </p>
          {runSnippet && (
            <p className="mt-0.5 font-mono text-[10px] text-slate-500">
              run {runSnippet}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="shrink-0 rounded border border-amber-200 bg-white px-2 py-1 text-xs text-slate-600 hover:bg-amber-100 dark:border-amber-800 dark:bg-zinc-900 dark:text-zinc-300"
        >
          Close
        </button>
      </div>

      <div className="relative min-h-[140px] max-h-[28%] shrink-0 bg-slate-100 dark:bg-zinc-900">
        {item.pdfPreviewUrl ? (
          <iframe
            src={item.pdfPreviewUrl}
            title={item.fileName || "HITL PDF"}
            className="absolute inset-0 h-full w-full border-0"
          />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-2 p-4 text-center">
            <p className="text-sm font-medium text-slate-700 dark:text-zinc-200">
              PDF preview unavailable
            </p>
            {item.localPdfPath && (
              <p
                className="mt-1 max-w-full truncate font-mono text-[10px] text-zinc-500"
                title={item.localPdfPath}
              >
                {item.localPdfPath}
              </p>
            )}
          </div>
        )}
      </div>

      <div className="shrink-0 space-y-2 border-b border-slate-200 p-3 dark:border-zinc-800">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Checksum comparison
        </h3>
        <dl className="grid grid-cols-2 gap-2 text-xs">
          <div className="rounded border border-slate-200 bg-slate-50 p-2 dark:border-zinc-700 dark:bg-zinc-900">
            <dt className="text-slate-500">Extracted deposits</dt>
            <dd className="mt-0.5 font-mono text-sm font-medium text-slate-900 dark:text-zinc-100">
              {formatMoney(item.extractedDeposits)}
            </dd>
          </div>
          <div className="rounded border border-slate-200 bg-slate-50 p-2 dark:border-zinc-700 dark:bg-zinc-900">
            <dt className="text-slate-500">Printed deposits</dt>
            <dd className="mt-0.5 font-mono text-sm font-medium text-slate-900 dark:text-zinc-100">
              {formatMoney(item.printedDeposits ?? item.extractedDeposits)}
            </dd>
          </div>
          <div className="col-span-2 rounded border border-amber-200 bg-amber-50/80 p-2 dark:border-amber-800 dark:bg-amber-950/40">
            <dt className="text-amber-800 dark:text-amber-200">Macro delta</dt>
            <dd className="mt-0.5 font-mono text-sm font-semibold text-amber-950 dark:text-amber-100">
              {formatMoney(item.delta)}
            </dd>
          </div>
        </dl>
        {firstViolation && (
          <button
            type="button"
            onClick={() =>
              typeof firstViolation.rowIndex === "number"
                ? jumpToViolation(firstViolation.rowIndex)
                : undefined
            }
            className="w-full rounded border border-rose-300 bg-rose-50 px-2 py-1.5 text-left text-xs text-rose-900 dark:border-rose-800 dark:bg-rose-950/50 dark:text-rose-100"
          >
            Micro-checksum break
            {typeof firstViolation.rowIndex === "number"
              ? ` at row #${firstViolation.rowIndex}`
              : ""}
            {firstViolation.delta != null
              ? ` · Δ ${formatMoney(firstViolation.delta)}`
              : ""}
            {violations.length > 1 ? ` (+${violations.length - 1} more)` : ""}
          </button>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        <table className="w-full border-collapse text-left text-[11px]">
          <thead className="sticky top-0 z-10 bg-slate-100 dark:bg-zinc-900">
            <tr className="border-b border-slate-200 text-slate-500 dark:border-zinc-700">
              <th className="px-2 py-1.5 font-semibold">#</th>
              <th className="px-2 py-1.5 font-semibold">Date</th>
              <th className="px-2 py-1.5 font-semibold">Description</th>
              <th className="px-2 py-1.5 font-semibold">Dep</th>
              <th className="px-2 py-1.5 font-semibold">Wdr</th>
              <th className="px-2 py-1.5 font-semibold">Bal</th>
              <th className="px-2 py-1.5 font-semibold">Pg</th>
            </tr>
          </thead>
          <tbody>
            {transactions.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-2 py-4 text-center text-slate-500">
                  No transactions in review payload
                </td>
              </tr>
            ) : (
              transactions.map((tx, i) => {
                const idx = typeof tx.rowIndex === "number" ? tx.rowIndex : i;
                const failed = failIndexes.has(idx);
                const selected = selectedViolation === idx;
                return (
                  <tr
                    key={`${idx}-${tx.date || ""}-${i}`}
                    ref={(el) => {
                      rowRefs.current[idx] = el;
                    }}
                    onClick={() => failed && jumpToViolation(idx)}
                    className={`border-b border-slate-100 dark:border-zinc-800 ${
                      failed
                        ? "cursor-pointer bg-rose-100 text-rose-950 dark:bg-rose-950/60 dark:text-rose-100"
                        : "text-slate-800 dark:text-zinc-200"
                    } ${selected ? "ring-2 ring-inset ring-primary" : ""}`}
                  >
                    <td className="px-2 py-1 font-mono">{idx}</td>
                    <td className="whitespace-nowrap px-2 py-1">{tx.date || "—"}</td>
                    <td className="max-w-[140px] truncate px-2 py-1" title={tx.description || undefined}>
                      {tx.description || "—"}
                    </td>
                    <td className="whitespace-nowrap px-2 py-1 font-mono">
                      {formatMoney(tx.deposit)}
                    </td>
                    <td className="whitespace-nowrap px-2 py-1 font-mono">
                      {formatMoney(tx.withdrawal)}
                    </td>
                    <td className="whitespace-nowrap px-2 py-1 font-mono">
                      {formatMoney(
                        tx.balance != null ? Number(tx.balance) : null
                      )}
                    </td>
                    <td className="px-2 py-1 font-mono">{tx.page ?? "—"}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <div className="shrink-0 border-t border-slate-200 p-3 dark:border-zinc-800">
        <button
          type="button"
          onClick={onOpenHub}
          className="w-full rounded-md bg-primary px-3 py-2 text-sm font-medium text-white hover:opacity-90"
        >
          Open in Upload Hub
        </button>
      </div>
    </div>
  );
}
