"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { PipelineShadowPanel } from "@/components/ParseTestPanels";
import { fetchStatementById } from "@/lib/apiClient";
import {
  formatCurrency,
  getChecksumFailures,
  getLayoutShadowEntries,
  type HeliosStatementPayload,
} from "@/lib/analysisAdapter";

function QualityInner() {
  const searchParams = useSearchParams();
  const id = searchParams.get("id") ?? "";
  const [inputId, setInputId] = useState(id);
  const [payload, setPayload] = useState<HeliosStatementPayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    setInputId(id);
    fetchStatementById(id)
      .then(setPayload)
      .catch((e) => setError(e instanceof Error ? e.message : "Load failed"));
  }, [id]);

  const failures = useMemo(
    () => (payload ? getChecksumFailures(payload) : []),
    [payload]
  );
  const shadows = useMemo(
    () => (payload ? getLayoutShadowEntries(payload) : []),
    [payload]
  );
  const summaries = payload?.data?.statement?.monthlyStatementSummaries ?? [];

  const load = () => {
    if (!inputId.trim()) return;
    window.location.href = `/dev/quality?id=${encodeURIComponent(inputId.trim())}`;
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-8 sm:px-8">
      <header>
        <h1 className="text-2xl font-semibold text-slate-900">Parse Quality Lab</h1>
        <p className="mt-1 text-sm text-slate-600">
          Per-file checksum, parse quality, and layout shadow metrics.
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
        {id && (
          <Link href={`/dashboard/${id}`} className="helios-btn helios-btn-secondary">
            Dashboard
          </Link>
        )}
      </div>

      {error && <p className="text-sm text-rose-700">{error}</p>}

      {payload && (
        <>
          {failures.length > 0 && (
            <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
              {failures.length} checksum failure(s)
            </div>
          )}

          <section className="helios-card overflow-hidden">
            <h2 className="border-b px-4 py-3 font-semibold text-slate-800">File summaries</h2>
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-3 text-left">File</th>
                  <th className="px-4 py-3 text-left">Deposits</th>
                  <th className="px-4 py-3 text-left">Withdrawals</th>
                  <th className="px-4 py-3 text-left">Checksum</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {summaries.map((s) => (
                  <tr key={s.fileName}>
                    <td className="px-4 py-3">{s.fileName}</td>
                    <td className="px-4 py-3">{formatCurrency(s.totalDeposits)}</td>
                    <td className="px-4 py-3">{formatCurrency(s.totalWithdrawals)}</td>
                    <td className="px-4 py-3">
                      {s.checksumOk === false ? "Fail" : s.checksumOk ? "Pass" : "—"}
                      {s.parseQuality ? ` (${s.parseQuality})` : ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          {shadows.map(({ fileName, shadow }) => (
            <section key={fileName} className="helios-card p-4">
              <h2 className="mb-3 font-semibold text-slate-800">{fileName} — shadow</h2>
              <PipelineShadowPanel shadow={shadow} />
            </section>
          ))}
        </>
      )}
    </div>
  );
}

export default function QualityPage() {
  return (
    <Suspense fallback={<p className="p-8 text-sm text-slate-500">Loading…</p>}>
      <QualityInner />
    </Suspense>
  );
}
