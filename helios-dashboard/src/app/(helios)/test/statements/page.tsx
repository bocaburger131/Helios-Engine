"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { fetchDevStatements, type StatementListItem } from "@/lib/apiClient";

const QUICK_IDS = [
  { id: "6a1b2a60f0fe2f7a4015c5ad", label: "Maas Treats (newer batch)" },
  { id: "6a1afb51b46733f137a80233", label: "Maas Treats (older)" },
];

export default function StatementsBrowserPage() {
  const [statements, setStatements] = useState<StatementListItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDevStatements(30)
      .then(setStatements)
      .catch((e) => setError(e instanceof Error ? e.message : "Load failed"))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="mx-auto max-w-4xl space-y-8 px-4 py-8 sm:px-8">
      <header className="space-y-2">
        <Link href="/upload" className="text-sm text-blue-600 hover:underline">
          ← Upload Hub
        </Link>
        <h1 className="text-2xl font-semibold text-slate-900">Statement browser</h1>
        <p className="text-sm text-slate-600">Mongo statement list via dev API.</p>
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
            </li>
          ))}
        </ul>
      </section>

      <section className="helios-card overflow-hidden">
        <div className="border-b px-6 py-4">
          <h2 className="font-semibold text-slate-900">Recent uploads</h2>
        </div>
        {loading && <p className="px-6 py-8 text-sm text-slate-500">Loading…</p>}
        {error && (
          <p className="mx-6 my-4 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-800">
            {error}
          </p>
        )}
        {!loading && statements.length > 0 && (
          <ul className="divide-y divide-slate-100">
            {statements.map((s) => {
              const id = s.id ?? s._id ?? "";
              return (
                <li
                  key={id}
                  className="flex flex-col gap-2 px-6 py-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <p className="font-medium text-slate-900">{s.fileName ?? "Untitled"}</p>
                    <p className="text-xs text-slate-500">
                      {s.bankName ?? "Unknown"} · {s.status ?? "—"}
                    </p>
                  </div>
                  <Link href={`/dashboard/${id}`} className="helios-btn helios-btn-primary py-1.5 text-xs">
                    Dashboard
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
