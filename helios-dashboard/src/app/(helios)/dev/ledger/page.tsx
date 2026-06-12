"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { fetchStatementById } from "@/lib/apiClient";
import { formatCurrency } from "@/lib/analysisAdapter";
import { getTransactionsFromPayload, type HeliosTransaction } from "@/lib/dailyActivityAdapter";

function LedgerInner() {
  const searchParams = useSearchParams();
  const id = searchParams.get("id") ?? "";
  const [inputId, setInputId] = useState(id);
  const [filter, setFilter] = useState("");
  const [rows, setRows] = useState<HeliosTransaction[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    setInputId(id);
    fetchStatementById(id)
      .then((p) => setRows(getTransactionsFromPayload(p)))
      .catch((e) => setError(e instanceof Error ? e.message : "Load failed"));
  }, [id]);

  const filtered = useMemo(() => {
    const q = filter.toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        String(r.description || "").toLowerCase().includes(q) ||
        String(r.category || "").toLowerCase().includes(q)
    );
  }, [rows, filter]);

  const load = () => {
    if (!inputId.trim()) return;
    window.location.href = `/dev/ledger?id=${encodeURIComponent(inputId.trim())}`;
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-8 sm:px-8">
      <header>
        <h1 className="text-2xl font-semibold text-slate-900">Transaction Ledger</h1>
        <p className="mt-1 text-sm text-slate-600">Searchable transaction table for any analysis.</p>
      </header>

      <div className="flex flex-wrap gap-2">
        <input
          type="text"
          value={inputId}
          onChange={(e) => setInputId(e.target.value)}
          placeholder="Statement ID"
          className="min-w-[200px] rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
        <button type="button" onClick={load} className="helios-btn helios-btn-primary">
          Load
        </button>
        <input
          type="search"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter description…"
          className="min-w-[200px] flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
      </div>

      {error && <p className="text-sm text-rose-700">{error}</p>}

      <div className="helios-card overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3">Description</th>
              <th className="px-4 py-3">Type</th>
              <th className="px-4 py-3">Amount</th>
              <th className="px-4 py-3">NSF</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filtered.map((r, i) => (
              <tr key={`${r.date}-${i}`}>
                <td className="px-4 py-2 whitespace-nowrap">{String(r.date ?? "—").slice(0, 10)}</td>
                <td className="max-w-md truncate px-4 py-2">{r.description ?? "—"}</td>
                <td className="px-4 py-2">{r.type ?? r.category ?? "—"}</td>
                <td className="px-4 py-2">{formatCurrency(r.amount ?? null)}</td>
                <td className="px-4 py-2">{r.isNsf ? "Yes" : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!filtered.length && !error && (
          <p className="px-4 py-8 text-center text-sm text-slate-500">No transactions loaded.</p>
        )}
      </div>
    </div>
  );
}

export default function LedgerPage() {
  return (
    <Suspense fallback={<p className="p-8 text-sm text-slate-500">Loading…</p>}>
      <LedgerInner />
    </Suspense>
  );
}
