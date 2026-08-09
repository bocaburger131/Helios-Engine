"use client";

import { useEffect, useMemo, useState } from "react";
import WidgetShell from "@/components/widgets/WidgetShell";
import CategorizerDataGrid, {
  txnRowKey,
} from "@/components/widgets/CategorizerDataGrid";
import {
  formatCurrency,
  type HeliosStatementPayload,
} from "@/lib/analysisAdapter";
import { patchStatementTransaction } from "@/lib/apiClient";
import { normalizeHighLevelCategory } from "@/lib/categorizerTaxonomy";
import {
  getTransactionsFromPayload,
  type HeliosTransaction,
} from "@/lib/dailyActivityAdapter";
import {
  downloadLedgerCsv,
  downloadLedgerXlsx,
} from "@/lib/exportLedger";
import {
  recalcCategorizerVitals,
  type CategorizerVitals,
} from "@/lib/recalcCategorizerVitals";

type FilterPill = "all" | "cogs" | "opex" | "large" | "nsf_risk";
type GroupBy = "none" | "date" | "category" | "month";

type Props = {
  payload: HeliosStatementPayload;
  minimized: boolean;
  onToggleMinimize: () => void;
  onVitalsChange?: (vitals: CategorizerVitals) => void;
  editable?: boolean;
};

function statementIdFromPayload(payload: HeliosStatementPayload): string | null {
  const s = payload.data?.statement as { _id?: string; id?: string } | undefined;
  return s?._id || s?.id || null;
}

function isCredit(t: HeliosTransaction): boolean {
  const ty = String(t.type || "").toUpperCase();
  if (ty === "CREDIT" || ty.includes("DEPOSIT") || ty === "IN") return true;
  if (ty === "DEBIT" || ty.includes("WITHDRAW") || ty === "OUT") return false;
  return Number(t.amount) >= 0;
}

function isNsfOrHighRisk(t: HeliosTransaction): boolean {
  if (t.isNsf || t.isNSF) return true;
  const hl = normalizeHighLevelCategory(t.category);
  return hl === "HIGH-RISK";
}

export default function WidgetCategorizer({
  payload,
  minimized,
  onToggleMinimize,
  onVitalsChange,
  editable = false,
}: Props) {
  const seed = useMemo(() => {
    const list = getTransactionsFromPayload(payload);
    return list.map((t, i) => ({
      ...t,
      _clientKey: String(t._id || t.id || `local-${i}`),
    })) as HeliosTransaction[];
  }, [payload]);
  const [rows, setRows] = useState<HeliosTransaction[]>(seed);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<FilterPill>("all");
  const [groupBy, setGroupBy] = useState<GroupBy>("none");
  const [exportOpen, setExportOpen] = useState(false);
  const [pendingKeys, setPendingKeys] = useState<Set<string>>(new Set());
  const [errorByKey, setErrorByKey] = useState<Record<string, string>>({});

  useEffect(() => {
    setRows(seed);
  }, [seed]);

  useEffect(() => {
    onVitalsChange?.(recalcCategorizerVitals(rows));
  }, [rows, onVitalsChange]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter((t) => {
      const hl = normalizeHighLevelCategory(t.category);
      if (filter === "cogs" && hl !== "COGS") return false;
      if (filter === "opex" && hl !== "OPEX") return false;
      if (filter === "large") {
        if (!isCredit(t) || Math.abs(Number(t.amount) || 0) < 5000) return false;
      }
      if (filter === "nsf_risk" && !isNsfOrHighRisk(t)) return false;

      if (!needle) return true;
      const amountStr = String(Math.abs(Number(t.amount) || 0));
      const hay = [
        t.description,
        t.originalDescription,
        t.category,
        t.subcategory,
        t.type,
        amountStr,
        formatCurrency(t.amount),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(needle);
    });
  }, [rows, q, filter]);

  const onOverride = async (
    rowKey: string,
    patch: {
      category?: string;
      subcategory?: string;
      taxDeductible?: string;
    }
  ) => {
    const idx = rows.findIndex(
      (t, i) => txnRowKey(t, i) === rowKey
    );
    if (idx < 0) return;
    const prev = rows[idx];
    const nextCat =
      normalizeHighLevelCategory(patch.category || prev.category) ||
      String(patch.category || prev.category || "");
    const optimistic: HeliosTransaction = {
      ...prev,
      category: nextCat || prev.category,
      subcategory:
        patch.subcategory !== undefined
          ? patch.subcategory
          : prev.subcategory,
      taxDeductible:
        patch.taxDeductible !== undefined
          ? patch.taxDeductible
          : prev.taxDeductible,
      categorizationSource: "analyst_override",
    };

    setRows((r) => r.map((t, i) => (i === idx ? optimistic : t)));
    setErrorByKey((e) => {
      const copy = { ...e };
      delete copy[rowKey];
      return copy;
    });

    const txnId = prev._id || prev.id;
    const statementId = statementIdFromPayload(payload);
    if (!txnId || !statementId || String(txnId).startsWith("idx-")) {
      // Local-only override when Mongo id is missing (embedded payload rows).
      return;
    }

    setPendingKeys((s) => new Set(s).add(rowKey));
    try {
      await patchStatementTransaction(statementId, String(txnId), {
        category: String(optimistic.category || "OPEX"),
        subcategory: optimistic.subcategory
          ? String(optimistic.subcategory)
          : undefined,
        taxDeductible: optimistic.taxDeductible
          ? String(optimistic.taxDeductible)
          : undefined,
      });
    } catch (err) {
      setRows((r) => r.map((t, i) => (i === idx ? prev : t)));
      setErrorByKey((e) => ({
        ...e,
        [rowKey]: err instanceof Error ? err.message : "Save failed",
      }));
    } finally {
      setPendingKeys((s) => {
        const next = new Set(s);
        next.delete(rowKey);
        return next;
      });
    }
  };

  const pills: { id: FilterPill; label: string }[] = [
    { id: "all", label: "All" },
    { id: "cogs", label: "COGS Only" },
    { id: "opex", label: "OpEx Only" },
    { id: "large", label: "Large Deposits" },
    { id: "nsf_risk", label: "NSF / High Risk" },
  ];

  return (
    <WidgetShell
      title="Transaction Categorizer"
      minimized={minimized}
      onToggleMinimize={onToggleMinimize}
      variant="results"
      editable={editable}
      headerExtra={
        <span className="font-mono text-[10px] text-slate-400">
          {filtered.length}/{rows.length}
        </span>
      }
    >
      <div className="mb-2 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search description or amount…"
            className="min-w-[180px] flex-1 rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-800 outline-none focus:border-[#3366a9] dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
          />
          <div className="relative">
            <button
              type="button"
              onClick={() => setExportOpen((o) => !o)}
              className="rounded-md bg-[#3366a9] px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90"
            >
              Export Ledger ▾
            </button>
            {exportOpen && (
              <div className="absolute right-0 z-20 mt-1 w-44 rounded-md border border-slate-200 bg-white py-1 shadow-lg dark:border-slate-700 dark:bg-slate-900">
                <button
                  type="button"
                  className="block w-full px-3 py-1.5 text-left text-xs hover:bg-slate-100 dark:hover:bg-slate-800"
                  onClick={() => {
                    downloadLedgerCsv(filtered);
                    setExportOpen(false);
                  }}
                >
                  Export as CSV
                </button>
                <button
                  type="button"
                  className="block w-full px-3 py-1.5 text-left text-xs hover:bg-slate-100 dark:hover:bg-slate-800"
                  onClick={() => {
                    void downloadLedgerXlsx(filtered).finally(() =>
                      setExportOpen(false)
                    );
                  }}
                >
                  Export as Excel (.xlsx)
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {pills.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setFilter(p.id)}
              className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${
                filter === p.id
                  ? "bg-[#3366a9] text-white"
                  : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"
              }`}
            >
              {p.label}
            </button>
          ))}
          <label className="ml-auto flex items-center gap-1 text-[10px] text-slate-500 dark:text-slate-400">
            Group by
            <select
              value={groupBy}
              onChange={(e) => setGroupBy(e.target.value as GroupBy)}
              className="rounded border border-slate-200 bg-white px-1.5 py-1 text-[10px] dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
            >
              <option value="none">None</option>
              <option value="date">Date</option>
              <option value="category">Category</option>
              <option value="month">Month</option>
            </select>
          </label>
        </div>
      </div>

      {filtered.length === 0 ? (
        <p className="text-sm text-slate-500 dark:text-slate-400">
          No transactions to display.
        </p>
      ) : (
        <>
          <CategorizerDataGrid
            rows={filtered}
            groupBy={groupBy === "none" ? "none" : groupBy}
            onOverride={(key, patch) => void onOverride(key, patch)}
            pendingKeys={pendingKeys}
            errorByKey={errorByKey}
          />
          {filtered.length > 500 && (
            <p className="mt-2 text-[10px] text-slate-400">
              Showing first 500 of {filtered.length} rows.
            </p>
          )}
        </>
      )}
    </WidgetShell>
  );
}
