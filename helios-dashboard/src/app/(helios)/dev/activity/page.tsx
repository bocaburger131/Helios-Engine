"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import ForensicChart from "@/components/charts/ForensicChart";
import { fetchStatementById } from "@/lib/apiClient";
import type { HeliosStatementPayload } from "@/lib/analysisAdapter";
import { getMonthOptions } from "@/lib/analysisAdapter";

function ActivityExplorerInner() {
  const searchParams = useSearchParams();
  const id = searchParams.get("id") ?? "";
  const [payload, setPayload] = useState<HeliosStatementPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [inputId, setInputId] = useState(id);

  useEffect(() => {
    if (!id) return;
    setInputId(id);
    setLoading(true);
    fetchStatementById(id)
      .then(setPayload)
      .catch((e) => setError(e instanceof Error ? e.message : "Load failed"))
      .finally(() => setLoading(false));
  }, [id]);

  const monthOptions = useMemo(
    () => (payload ? getMonthOptions(payload) : []),
    [payload]
  );

  const load = () => {
    if (!inputId.trim()) return;
    window.location.href = `/dev/activity?id=${encodeURIComponent(inputId.trim())}`;
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-8 sm:px-8">
      <header>
        <h1 className="text-2xl font-semibold text-slate-900">Daily Activity Explorer</h1>
        <p className="mt-1 text-sm text-slate-600">
          Day-by-day deposits, withdrawals, and balance for any completed analysis.
        </p>
      </header>

      <div className="flex flex-wrap gap-2">
        <input
          type="text"
          value={inputId}
          onChange={(e) => setInputId(e.target.value)}
          placeholder="Statement ID"
          className="min-w-[240px] flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
        <button type="button" onClick={load} className="helios-btn helios-btn-primary">
          Load
        </button>
      </div>

      {loading && <p className="text-sm text-slate-500">Loading…</p>}
      {error && <p className="text-sm text-rose-700">{error}</p>}

      {payload && (
        <>
          {monthOptions.length > 0 && (
            <p className="text-xs text-slate-500">
              Use drill-down month on chart for daily view of a single statement month.
            </p>
          )}
          <ForensicChart payload={payload} defaultHorizon="daily" showMonthDrill />
        </>
      )}
    </div>
  );
}

export default function ActivityExplorerPage() {
  return (
    <Suspense fallback={<p className="p-8 text-sm text-slate-500">Loading…</p>}>
      <ActivityExplorerInner />
    </Suspense>
  );
}
