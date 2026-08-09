"use client";

import { useCallback, useEffect, useState } from "react";
import type { DbStatus } from "../helios-api";

export default function DataExplorer() {
  const [status, setStatus] = useState<DbStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    // #region agent log
    fetch("http://127.0.0.1:7779/ingest/14ba3817-11f8-4e9c-85f8-0a9bab98d3ad", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Debug-Session-Id": "84ef67",
      },
      body: JSON.stringify({
        sessionId: "84ef67",
        runId: "renderer",
        hypothesisId: "C",
        location: "DataExplorer.tsx:refresh",
        message: "db status refresh",
        data: {
          hasHeliosApi: Boolean(window.helios),
          userAgent: navigator.userAgent.includes("Electron"),
        },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion
    try {
      if (!window.helios?.getDbStatus) {
        setMessage("Electron IPC unavailable — open the desktop window, not the browser.");
        setStatus(null);
        return;
      }
      const s = await window.helios.getDbStatus();
      setStatus(s);
      // #region agent log
      fetch("http://127.0.0.1:7779/ingest/14ba3817-11f8-4e9c-85f8-0a9bab98d3ad", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Debug-Session-Id": "84ef67",
        },
        body: JSON.stringify({
          sessionId: "84ef67",
          runId: "renderer",
          hypothesisId: "D",
          location: "DataExplorer.tsx:refresh:ok",
          message: "db status result",
          data: {
            redisOk: s?.redis?.ok,
            mongoOk: s?.mongo?.ok,
            redisContainer: s?.redis?.container,
            mongoContainer: s?.mongo?.container,
          },
          timestamp: Date.now(),
        }),
      }).catch(() => {});
      // #endregion
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Status check failed");
    }
  }, []);

  useEffect(() => {
    void refresh();
    const t = setInterval(() => void refresh(), 8000);
    return () => clearInterval(t);
  }, [refresh]);

  const runNuke = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const result = await window.helios.nukeAndPave();
      setMessage(
        result.ok
          ? "Nuke & Pave completed — Redis FLUSHDB + Mongo drop bank-statement-dev."
          : result.error || "Nuke finished with errors (see Terminal)."
      );
      await refresh();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Nuke failed");
    } finally {
      setBusy(false);
      setConfirmOpen(false);
    }
  };

  const Pill = ({ ok, label }: { ok: boolean; label: string }) => (
    <span
      className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium ${
        ok
          ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
          : "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300"
      }`}
    >
      <span
        className={`h-2 w-2 rounded-full ${ok ? "bg-emerald-500" : "bg-rose-500"}`}
      />
      {label}
    </span>
  );

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-slate-900 dark:text-zinc-100">
          Data Explorer
        </h2>
        <p className="mt-1 text-sm text-slate-600 dark:text-zinc-400">
          Local Redis / Mongo health. Alias:{" "}
          <code className="text-xs">helios-redis-stack</code> →{" "}
          <code className="text-xs">bank-analyzer-redis</code>.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <Pill ok={Boolean(status?.redis.ok)} label="Redis" />
        <Pill ok={Boolean(status?.mongo.ok)} label="Mongo" />
        <button
          type="button"
          onClick={() => void refresh()}
          className="rounded border border-slate-300 px-3 py-1 text-xs dark:border-zinc-700"
        >
          Refresh
        </button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <StatusCard
          title="Redis"
          container={status?.redis.container || "bank-analyzer-redis"}
          port={status?.redis.port || "6380"}
          detail={status?.redis.detail}
          ok={status?.redis.ok}
        />
        <StatusCard
          title="MongoDB"
          container={status?.mongo.container || "bank-analyzer-mongo"}
          port={status?.mongo.port || "27017"}
          detail={status?.mongo.detail}
          ok={status?.mongo.ok}
        />
      </div>

      <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 dark:border-rose-900 dark:bg-rose-950/40">
        <h3 className="font-semibold text-rose-900 dark:text-rose-200">Nuke &amp; Pave</h3>
        <p className="mt-1 text-sm text-rose-800 dark:text-rose-300">
          Flushes Redis DB and drops local Mongo database{" "}
          <code>bank-statement-dev</code>. Irreversible for local test data.
        </p>
        <button
          type="button"
          disabled={busy}
          onClick={() => setConfirmOpen(true)}
          className="mt-3 rounded bg-rose-700 px-3 py-2 text-sm font-medium text-white hover:bg-rose-800 disabled:opacity-50"
        >
          {busy ? "Running…" : "Nuke & Pave"}
        </button>
      </div>

      {message && (
        <p className="text-sm text-slate-700 dark:text-zinc-300">{message}</p>
      )}

      {confirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-lg bg-white p-5 shadow-xl dark:bg-zinc-900">
            <h4 className="text-lg font-semibold">Confirm Nuke &amp; Pave</h4>
            <p className="mt-2 text-sm text-slate-600 dark:text-zinc-400">
              This will FLUSHDB on Redis and drop <code>bank-statement-dev</code> in
              Mongo. Continue?
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmOpen(false)}
                className="rounded border px-3 py-1.5 text-sm dark:border-zinc-700"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void runNuke()}
                className="rounded bg-rose-700 px-3 py-1.5 text-sm font-medium text-white"
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StatusCard({
  title,
  container,
  port,
  detail,
  ok,
}: {
  title: string;
  container: string;
  port: string;
  detail?: string;
  ok?: boolean;
}) {
  return (
    <div className="rounded-lg border border-slate-200 p-4 dark:border-zinc-800">
      <div className="flex items-center justify-between">
        <h3 className="font-medium">{title}</h3>
        <span className={`text-xs ${ok ? "text-emerald-600" : "text-rose-600"}`}>
          {ok ? "connected" : "down"}
        </span>
      </div>
      <dl className="mt-3 space-y-1 font-mono text-xs text-slate-600 dark:text-zinc-400">
        <div>
          <dt className="inline text-slate-400">container </dt>
          <dd className="inline">{container}</dd>
        </div>
        <div>
          <dt className="inline text-slate-400">port </dt>
          <dd className="inline">{port}</dd>
        </div>
        {detail && (
          <div className="truncate pt-1 text-zinc-500" title={detail}>
            {detail}
          </div>
        )}
      </dl>
    </div>
  );
}
