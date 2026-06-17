"use client";

import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { fetchDevStatements, type StatementListItem } from "@/lib/apiClient";
import { formatAnalyzedAt } from "@/lib/analysisAdapter";

const QUICK_IDS = [
  { id: "6a1b2a60f0fe2f7a4015c5ad", label: "Maas Treats (newer batch)" },
  { id: "6a1afb51b46733f137a80233", label: "Maas Treats (older)" },
];

export default function ResultsPage() {
  return (
    <Suspense fallback={<p className="p-8 text-sm text-slate-500">Loading…</p>}>
      <ResultsPageInner />
    </Suspense>
  );
}

function ResultsPageInner() {
  const searchParams = useSearchParams();
  const idParam = searchParams.get("id");
  const [statements, setStatements] = useState<StatementListItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (idParam) {
      window.location.replace(`/dashboard/${encodeURIComponent(idParam)}`);
    }
  }, [idParam]);

  useEffect(() => {
    fetchDevStatements(30)
      .then(setStatements)
      .catch((e) => setError(e instanceof Error ? e.message : "Load failed"))
      .finally(() => setLoading(false));
  }, []);

  if (idParam) {
    return (
      <div className="flex items-center justify-center px-4 py-24 text-sm text-slate-500">
        Redirecting to dashboard…
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-8 px-4 py-8 sm:px-8">
      <header>
        <h1 className="text-2xl font-semibold text-slate-900">Results</h1>
        <p className="mt-1 text-sm text-slate-600">
          Recent batch analyses — select a statement to open the full underwriting report.
        </p>
      </header>

      <section className="helios-card p-6">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          Quick links
        </h2>
        <ul className="mt-3 space-y-2">
          {QUICK_IDS.map((q) => (
            <li key={q.id}>
              <Link href={`/dashboard/${q.id}`} className="text-blue-600 hover:underline">
                {q.label}
              </Link>
              <span className="ml-2 font-mono text-xs text-slate-400">{q.id}</span>
            </li>
          ))}
          <li>
            <Link
              href="/dashboard/6a1b2a60f0fe2f7a4015c5ad?fixture=1"
              className="text-blue-600 hover:underline"
            >
              Sample report (fixture)
            </Link>
          </li>
        </ul>
      </section>

      <section className="helios-card overflow-hidden">
        <div className="border-b border-[var(--helios-border)] px-6 py-4">
          <h2 className="font-semibold text-slate-900">Recent uploads</h2>
        </div>
        {loading && <p className="px-6 py-8 text-sm text-slate-500">Loading…</p>}
        {error && (
          <p className="mx-6 my-4 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-800">
            {error}
          </p>
        )}
        {!loading && !error && statements.length === 0 && (
          <p className="px-6 py-8 text-sm text-slate-500">No statements in database.</p>
        )}
        {!loading && statements.length > 0 && (
          <ul className="divide-y divide-slate-100">
            {statements.map((s) => {
              const id = s.id ?? s._id ?? "";
              const title =
                s.analysisTitle ||
                s.applicationContext?.companyName ||
                s.fileName ||
                "Untitled";
              const analyzed = formatAnalyzedAt(
                s.analyzedAt || s.uploadDate || null
              );
              return (
                <li
                  key={id}
                  className="flex flex-col gap-2 px-6 py-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <p className="font-medium text-slate-900">{title}</p>
                    <p className="text-xs text-slate-500">
                      Analyzed {analyzed}
                      {s.monthsAnalyzedLabel ? ` · ${s.monthsAnalyzedLabel}` : ""}
                      {" · "}
                      {s.bankName ?? "Unknown bank"} · {s.status ?? "—"}
                      {s.veraDecision ? ` · Vera: ${s.veraDecision}` : ""}
                    </p>
                  </div>
                  <Link
                    href={`/dashboard/${id}`}
                    className="helios-btn helios-btn-primary py-1.5 text-xs"
                  >
                    Open report
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
