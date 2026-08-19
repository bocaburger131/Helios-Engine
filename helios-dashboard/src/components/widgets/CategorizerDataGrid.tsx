"use client";

import { Fragment, useMemo } from "react";
import {
  HIGH_LEVEL_CATEGORIES,
  HIGH_LEVEL_LABELS,
  TAX_DEDUCTIBLE_VALUES,
  TAX_LABELS,
  formatSubcategoryLabel,
  normalizeHighLevelCategory,
  subcategoriesFor,
  type HighLevelCategory,
  type TaxDeductible,
} from "@/lib/categorizerTaxonomy";
import type { HeliosTransaction } from "@/lib/dailyActivityAdapter";
import { formatCurrency } from "@/lib/analysisAdapter";

type Props = {
  rows: HeliosTransaction[];
  groupBy: "none" | "date" | "category" | "month";
  onOverride: (
    rowKey: string,
    patch: {
      category?: string;
      subcategory?: string;
      taxDeductible?: string;
    }
  ) => void;
  pendingKeys?: Set<string>;
  errorByKey?: Record<string, string>;
};

function formatDate(d: string | Date | undefined): string {
  if (!d) return "—";
  if (typeof d === "string") return d.slice(0, 10);
  if (d instanceof Date && !Number.isNaN(d.getTime())) {
    return d.toISOString().slice(0, 10);
  }
  return "—";
}

function monthKey(d: string | Date | undefined): string {
  const s = formatDate(d);
  return s.length >= 7 ? s.slice(0, 7) : "Unknown";
}

export function txnRowKey(t: HeliosTransaction, idx: number): string {
  return String(
    (t as { _clientKey?: string })._clientKey || t._id || t.id || `idx-${idx}`
  );
}

function isCredit(t: HeliosTransaction): boolean {
  const ty = String(t.type || "").toUpperCase();
  if (ty === "CREDIT" || ty.includes("DEPOSIT") || ty === "IN") return true;
  if (ty === "DEBIT" || ty.includes("WITHDRAW") || ty === "OUT") return false;
  return Number(t.amount) >= 0;
}

function typeLabel(t: HeliosTransaction): string {
  return isCredit(t) ? "Credit" : "Debit";
}

function isOverridden(t: HeliosTransaction): boolean {
  return (
    t.categorizationSource === "analyst_override" ||
    Boolean((t as { flags?: { isReviewed?: boolean } }).flags?.isReviewed)
  );
}

function BadgeSelect({
  value,
  options,
  labels,
  onChange,
  disabled,
}: {
  value: string;
  options: readonly string[];
  labels?: Record<string, string>;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  return (
    <select
      disabled={disabled}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="max-w-[140px] cursor-pointer rounded-full border border-slate-300 bg-slate-100 px-2 py-0.5 text-[10px] font-semibold outline-none focus:ring-1 focus:ring-[#3366a9] disabled:opacity-60 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
      style={
        value
          ? { borderColor: "#3366a9", color: "#3366a9" }
          : { color: undefined }
      }
    >
      <option value="">—</option>
      {options.map((opt) => (
        <option key={opt} value={opt}>
          {labels?.[opt] || formatSubcategoryLabel(opt)}
        </option>
      ))}
    </select>
  );
}

export default function CategorizerDataGrid({
  rows,
  groupBy,
  onOverride,
  pendingKeys,
  errorByKey,
}: Props) {
  const grouped = useMemo(() => {
    if (groupBy === "none") {
      return [{ key: "all", label: null as string | null, items: rows }];
    }
    const map = new Map<string, HeliosTransaction[]>();
    for (const t of rows) {
      let key = "Unknown";
      if (groupBy === "date") key = formatDate(t.date);
      else if (groupBy === "month") key = monthKey(t.date);
      else if (groupBy === "category") {
        const hl = normalizeHighLevelCategory(t.category);
        key = hl
          ? HIGH_LEVEL_LABELS[hl]
          : String(t.category || "Uncategorized");
      }
      const list = map.get(key) ?? [];
      list.push(t);
      map.set(key, list);
    }
    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, items]) => ({ key, label: key, items }));
  }, [rows, groupBy]);

  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800 dark:bg-slate-900">
      <table className="min-w-full text-left text-xs text-slate-800 dark:text-slate-200">
        <thead className="sticky top-0 z-10 bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500 dark:bg-slate-950 dark:text-slate-400">
          <tr>
            <th className="px-2 py-1.5">Date</th>
            <th className="px-2 py-1.5">Raw Description</th>
            <th className="px-2 py-1.5">Type</th>
            <th className="px-2 py-1.5 text-right">Amount</th>
            <th className="px-2 py-1.5">High-Level Category</th>
            <th className="px-2 py-1.5">Sub-Category</th>
            <th className="px-2 py-1.5">Tax</th>
            <th className="px-2 py-1.5">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
          {grouped.map((section) => (
            <Fragment key={section.key}>
              {section.label != null && (
                <tr className="bg-slate-100/80 dark:bg-slate-950/80">
                  <td
                    colSpan={8}
                    className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400"
                  >
                    {section.label}
                  </td>
                </tr>
              )}
              {section.items.slice(0, 500).map((t, idx) => {
                const key = txnRowKey(t, idx);
                const hl =
                  normalizeHighLevelCategory(t.category) ||
                  ("" as HighLevelCategory | "");
                const subs = hl ? subcategoriesFor(hl) : [];
                const credit = isCredit(t);
                const pending = pendingKeys?.has(key);
                const err = errorByKey?.[key];
                return (
                  <tr
                    key={key}
                    className="hover:bg-slate-50 dark:hover:bg-slate-800/40"
                  >
                    <td className="whitespace-nowrap px-2 py-1 font-mono">
                      {formatDate(t.date)}
                    </td>
                    <td
                      className="max-w-[220px] truncate px-2 py-1"
                      title={t.originalDescription || t.description || ""}
                    >
                      {t.originalDescription || t.description || "—"}
                    </td>
                    <td className="px-2 py-1">{typeLabel(t)}</td>
                    <td
                      className={`whitespace-nowrap px-2 py-1 text-right font-mono ${
                        credit ? "text-emerald-500" : "text-rose-500"
                      }`}
                    >
                      {formatCurrency(t.amount)}
                    </td>
                    <td className="px-2 py-1">
                      <BadgeSelect
                        value={hl}
                        options={HIGH_LEVEL_CATEGORIES}
                        labels={HIGH_LEVEL_LABELS}
                        disabled={pending}
                        onChange={(v) =>
                          onOverride(key, {
                            category: v,
                            subcategory: "",
                          })
                        }
                      />
                    </td>
                    <td className="px-2 py-1">
                      <BadgeSelect
                        value={String(t.subcategory || "").toUpperCase()}
                        options={subs}
                        disabled={pending || !hl}
                        onChange={(v) =>
                          onOverride(key, {
                            category: hl || undefined,
                            subcategory: v,
                          })
                        }
                      />
                    </td>
                    <td className="px-2 py-1">
                      <BadgeSelect
                        value={String(t.taxDeductible || "unknown")}
                        options={TAX_DEDUCTIBLE_VALUES}
                        labels={TAX_LABELS}
                        disabled={pending}
                        onChange={(v) =>
                          onOverride(key, {
                            category: hl || String(t.category || "OPEX"),
                            taxDeductible: v as TaxDeductible,
                          })
                        }
                      />
                    </td>
                    <td className="px-2 py-1">
                      {isOverridden(t) ? (
                        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800 dark:bg-amber-900/40 dark:text-amber-200">
                          Analyst Overridden
                        </span>
                      ) : (
                        <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                          Auto-AI
                        </span>
                      )}
                      {err ? (
                        <p className="mt-0.5 text-[10px] text-rose-500">{err}</p>
                      ) : null}
                      {pending ? (
                        <p className="mt-0.5 text-[10px] text-slate-400">
                          Saving…
                        </p>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}
