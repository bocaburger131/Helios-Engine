"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReportReadResult } from "../helios-api";

const PAGE_SIZE = 25;

export default function ReportHub() {
  const [data, setData] = useState<ReportReadResult | null>(null);
  const [uploads, setUploads] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [page, setPage] = useState(0);
  const [query, setQuery] = useState("");

  const load = useCallback(async (path?: string) => {
    setError(null);
    try {
      const result = await window.helios.readReports(path ? { path } : undefined);
      setData(result);
      setPage(0);
      setSortKey(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to read reports");
    }
  }, []);

  useEffect(() => {
    void load();
    window.helios
      .listUploadReports()
      .then(setUploads)
      .catch(() => setUploads([]));
  }, [load]);

  const filtered = useMemo(() => {
    if (!data) return [];
    const q = query.trim().toLowerCase();
    let rows = data.rows;
    if (q) {
      rows = rows.filter((r) =>
        Object.values(r).some((v) => String(v).toLowerCase().includes(q))
      );
    }
    if (sortKey) {
      rows = [...rows].sort((a, b) => {
        const av = String(a[sortKey] ?? "");
        const bv = String(b[sortKey] ?? "");
        const cmp = av.localeCompare(bv, undefined, { numeric: true });
        return sortDir === "asc" ? cmp : -cmp;
      });
    }
    return rows;
  }, [data, query, sortKey, sortDir]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageRows = filtered.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);

  const toggleSort = (key: string) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-zinc-100">
            Report Hub
          </h2>
          <p className="truncate font-mono text-xs text-slate-500 dark:text-zinc-500">
            {data?.path || "reports/extraction_results.csv"}
          </p>
        </div>
        <input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setPage(0);
          }}
          placeholder="Filter rows…"
          className="rounded border border-slate-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        />
        <button
          type="button"
          onClick={() => void load()}
          className="rounded bg-primary px-3 py-1.5 text-sm font-medium text-white hover:opacity-90"
        >
          Reload CSV
        </button>
      </div>

      {uploads.length > 0 && (
        <label className="block text-xs text-slate-600 dark:text-zinc-400">
          Latest upload reports
          <select
            className="mt-1 w-full rounded border border-slate-300 bg-white px-2 py-1.5 font-mono text-xs dark:border-zinc-700 dark:bg-zinc-900"
            defaultValue=""
            onChange={(e) => {
              if (e.target.value) void load(e.target.value);
            }}
          >
            <option value="">— select —</option>
            {uploads.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </label>
      )}

      {error && (
        <p className="rounded border border-rose-300 bg-rose-50 px-3 py-2 text-sm text-rose-800 dark:border-rose-800 dark:bg-rose-950 dark:text-rose-200">
          {error}
        </p>
      )}

      {data?.missing && (
        <p className="rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100">
          File missing. Expected at <code>reports/extraction_results.csv</code> under
          the monorepo root. Showing empty table.
        </p>
      )}

      <div className="min-h-0 flex-1 overflow-auto rounded-lg border border-slate-200 dark:border-zinc-800">
        <table className="w-full min-w-[640px] border-collapse text-left text-sm">
          <thead className="sticky top-0 bg-slate-100 dark:bg-zinc-900">
            <tr>
              {(data?.headers || []).map((h) => (
                <th key={h} className="px-3 py-2 font-semibold">
                  <button type="button" onClick={() => toggleSort(h)} className="hover:text-primary">
                    {h}
                    {sortKey === h ? (sortDir === "asc" ? " ↑" : " ↓") : ""}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pageRows.length === 0 ? (
              <tr>
                <td
                  colSpan={Math.max(1, data?.headers.length || 1)}
                  className="px-3 py-8 text-center text-slate-500"
                >
                  No rows
                </td>
              </tr>
            ) : (
              pageRows.map((row, i) => (
                <tr
                  key={i}
                  className="border-t border-slate-100 odd:bg-white even:bg-slate-50 dark:border-zinc-800 dark:odd:bg-zinc-950 dark:even:bg-zinc-900/60"
                >
                  {(data?.headers || []).map((h) => (
                    <td key={h} className="px-3 py-1.5 font-mono text-xs">
                      {row[h]}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between text-xs text-slate-600 dark:text-zinc-400">
        <span>
          {filtered.length} row{filtered.length === 1 ? "" : "s"} · page {page + 1} / {pageCount}
        </span>
        <div className="flex gap-2">
          <button
            type="button"
            disabled={page <= 0}
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            className="rounded border px-2 py-1 disabled:opacity-40 dark:border-zinc-700"
          >
            Prev
          </button>
          <button
            type="button"
            disabled={page >= pageCount - 1}
            onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
            className="rounded border px-2 py-1 disabled:opacity-40 dark:border-zinc-700"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}
