"use client";

import { useCallback, useEffect, useState } from "react";
import { useTheme } from "next-themes";
import LogViewer from "./LogViewer";
import ReportHub from "./ReportHub";
import DataExplorer from "./DataExplorer";
import SettingsPanel from "./SettingsPanel";
import HitlWorkspace from "./HitlWorkspace";
import type {
  HitlQueueItem,
  ServiceId,
  ServiceStatus,
  ServiceStatusMap,
} from "../helios-api";

type NavId = "services" | "terminal" | "reports" | "data" | "settings";

const NAV: { id: NavId; label: string }[] = [
  { id: "services", label: "Services" },
  { id: "terminal", label: "Terminal" },
  { id: "reports", label: "Reports" },
  { id: "data", label: "Data Explorer" },
  { id: "settings", label: "Settings" },
];

const SERVICES: { id: ServiceId; title: string; blurb: string }[] = [
  {
    id: "helios",
    title: "Helios Dev",
    blurb: "npm run dev (API + dashboard)",
  },
  {
    id: "docker",
    title: "Docker",
    blurb: "bank-analyzer-redis + bank-analyzer-mongo",
  },
  {
    id: "ngrok",
    title: "Ngrok",
    blurb: "ngrok http 3000",
  },
];

const UPLOAD_HUB_BASE = "http://localhost:3002/upload";

function heliosTone(s: ServiceStatus | undefined): "online" | "degraded" | "offline" {
  const running = Boolean(s?.isRunning ?? s?.running);
  const healthy = Boolean(s?.isHealthy);
  if (!running) return "offline";
  if (!healthy) return "degraded";
  return "online";
}

function serviceIsRunning(s: ServiceStatus | undefined): boolean {
  return Boolean(s?.isRunning ?? s?.running);
}

function buildUploadHubUrl(item: HitlQueueItem): string {
  const url = new URL(UPLOAD_HUB_BASE);
  if (item.id) url.searchParams.set("processingRunId", item.id);
  if (item.fileName) url.searchParams.set("fileName", item.fileName);
  return url.toString();
}

export default function Dashboard() {
  const [nav, setNav] = useState<NavId>("services");
  const [status, setStatus] = useState<ServiceStatusMap | null>(null);
  const [busyId, setBusyId] = useState<ServiceId | null>(null);
  const [resetting, setResetting] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  const [hitlItems, setHitlItems] = useState<HitlQueueItem[]>([]);
  const [activeHitl, setActiveHitl] = useState<HitlQueueItem | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const { theme, setTheme, resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const refreshStatus = useCallback(async () => {
    if (!window.helios) return;
    try {
      setStatus(await window.helios.getServiceStatus());
    } catch {
      /* ignore until preload ready */
    }
  }, []);

  const refreshHitlQueue = useCallback(async () => {
    if (!window.helios?.fetchHitlQueue) return;
    try {
      const r = await window.helios.fetchHitlQueue();
      const items = r.ok ? r.items : [];
      setHitlItems(items);
      setActiveHitl((prev) => {
        if (!items.length) return null;
        if (prev?.id) {
          const still = items.find((i) => i.id === prev.id);
          if (still) return still;
        }
        return items[0];
      });
    } catch {
      setHitlItems([]);
      setActiveHitl(null);
    }
  }, []);

  useEffect(() => {
    void refreshStatus();
    const t = setInterval(() => void refreshStatus(), 5000);
    return () => clearInterval(t);
  }, [refreshStatus]);

  useEffect(() => {
    void refreshHitlQueue();
    const t = setInterval(() => void refreshHitlQueue(), 5000);
    return () => clearInterval(t);
  }, [refreshHitlQueue]);

  useEffect(() => {
    if (!hitlItems.length) setPreviewOpen(false);
  }, [hitlItems.length]);

  const openUploadHub = async (item?: HitlQueueItem | null) => {
    const target = item || activeHitl || hitlItems[0];
    if (!target) return;
    const url = buildUploadHubUrl(target);
    try {
      if (window.helios?.openExternal) {
        const r = await window.helios.openExternal(url);
        if (r.ok) return;
      }
    } catch {
      /* fall through */
    }
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const start = async (id: ServiceId) => {
    setBusyId(id);
    setFlash(`Starting ${id}…`);
    // #region agent log
    fetch("http://127.0.0.1:7779/ingest/14ba3817-11f8-4e9c-85f8-0a9bab98d3ad", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Debug-Session-Id": "655110",
      },
      body: JSON.stringify({
        sessionId: "655110",
        runId: "start-click",
        hypothesisId: "A",
        location: "Dashboard.tsx:start",
        message: "Start clicked",
        data: {
          id,
          hasHeliosApi: Boolean(window.helios),
          hasStartService: Boolean(window.helios?.startService),
        },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion
    try {
      if (!window.helios?.startService) {
        setFlash("Helios API unavailable (preload)");
        return;
      }
      const r = await window.helios.startService(id);
      // #region agent log
      fetch("http://127.0.0.1:7779/ingest/14ba3817-11f8-4e9c-85f8-0a9bab98d3ad", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Debug-Session-Id": "655110",
        },
        body: JSON.stringify({
          sessionId: "655110",
          runId: "start-click",
          hypothesisId: "C",
          location: "Dashboard.tsx:start",
          message: "startService result",
          data: { id, ok: r?.ok, error: r?.error ?? null, detail: r?.detail ?? null },
          timestamp: Date.now(),
        }),
      }).catch(() => {});
      // #endregion
      setFlash(
        r.ok
          ? r.detail
            ? `Started ${id}: ${r.detail}`
            : `Started ${id}`
          : r.error || `Failed to start ${id}`
      );
      await refreshStatus();
      // #region agent log
      try {
        const st = await window.helios.getServiceStatus();
        fetch("http://127.0.0.1:7779/ingest/14ba3817-11f8-4e9c-85f8-0a9bab98d3ad", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Debug-Session-Id": "655110",
          },
          body: JSON.stringify({
            sessionId: "655110",
            runId: "start-click",
            hypothesisId: "D",
            location: "Dashboard.tsx:start",
            message: "status after start",
            data: { helios: st?.helios ?? null },
            timestamp: Date.now(),
          }),
        }).catch(() => {});
      } catch {
        /* ignore */
      }
      // #endregion
    } catch (err) {
      // #region agent log
      fetch("http://127.0.0.1:7779/ingest/14ba3817-11f8-4e9c-85f8-0a9bab98d3ad", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Debug-Session-Id": "655110",
        },
        body: JSON.stringify({
          sessionId: "655110",
          runId: "start-click",
          hypothesisId: "A",
          location: "Dashboard.tsx:start",
          message: "start threw",
          data: { id, error: err instanceof Error ? err.message : String(err) },
          timestamp: Date.now(),
        }),
      }).catch(() => {});
      // #endregion
      setFlash(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyId(null);
    }
  };

  const stop = async (id: ServiceId) => {
    setBusyId(id);
    setFlash(null);
    try {
      const r = await window.helios.stopService(id);
      setFlash(r.ok ? `Stopped ${id}` : r.error || `Failed to stop ${id}`);
      await refreshStatus();
    } finally {
      setBusyId(null);
    }
  };

  const reset = async () => {
    setBusyId("helios");
    setResetting(true);
    setFlash("Resetting API…");
    try {
      if (!window.helios?.resetService) {
        setFlash("resetService IPC unavailable (restart Electron app)");
        return;
      }
      const r = await window.helios.resetService("helios");
      setFlash(
        r.ok
          ? r.detail || "Helios reset — fresh process spawned"
          : r.error || "Helios reset failed"
      );
      await refreshStatus();
    } catch (err) {
      setFlash(err instanceof Error ? err.message : String(err));
    } finally {
      setResetting(false);
      setBusyId(null);
    }
  };

  const dark = mounted && (resolvedTheme === "dark" || theme === "dark");
  const alertItem = activeHitl || hitlItems[0] || null;

  return (
    <div className="flex h-full min-h-0">
      <aside className="flex w-56 shrink-0 flex-col border-r border-slate-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
        <div className="border-b border-slate-200 px-4 py-5 dark:border-zinc-800">
          <div className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">
            Helios
          </div>
          <div className="mt-1 text-sm font-medium text-slate-800 dark:text-zinc-100">
            Dev Console
          </div>
        </div>
        <nav className="flex flex-1 flex-col gap-1 p-2">
          {NAV.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setNav(item.id)}
              className={`rounded-md px-3 py-2 text-left text-sm font-medium ${
                nav === item.id
                  ? "bg-primary text-white"
                  : "text-slate-700 hover:bg-slate-100 dark:text-zinc-300 dark:hover:bg-zinc-900"
              }`}
            >
              {item.label}
              {item.id === "settings" && hitlItems.length > 0 && (
                <span className="ml-2 rounded-full bg-amber-500 px-1.5 py-0.5 text-[10px] text-amber-950">
                  {hitlItems.length}
                </span>
              )}
            </button>
          ))}
        </nav>
        <div className="space-y-2 border-t border-slate-200 p-3 dark:border-zinc-800">
          <div className="flex flex-wrap gap-1">
            {SERVICES.map((s) => {
              const st = status?.[s.id];
              if (s.id === "helios") {
                const tone = heliosTone(st);
                return <StatusDot key={s.id} label={s.id} tone={tone} />;
              }
              return (
                <StatusDot
                  key={s.id}
                  label={s.id}
                  on={Boolean(st?.running)}
                />
              );
            })}
          </div>
          {mounted && (
            <button
              type="button"
              onClick={() => setTheme(dark ? "light" : "dark")}
              className="w-full rounded border border-slate-300 px-2 py-1.5 text-xs dark:border-zinc-700"
            >
              {dark ? "Light mode" : "Dark mode"}
            </button>
          )}
        </div>
      </aside>

      <main className="flex min-w-0 flex-1 flex-col">
        {alertItem && (
          <HitlAlertBar
            item={alertItem}
            queueCount={hitlItems.length}
            onOpenHub={() => void openUploadHub(alertItem)}
            onPreview={() => {
              setActiveHitl(alertItem);
              setPreviewOpen(true);
            }}
          />
        )}

        <div className="flex min-h-0 flex-1">
          <div className="flex min-w-0 flex-1 flex-col">
            <header className="flex items-center justify-between border-b border-slate-200 px-6 py-4 dark:border-zinc-800">
              <h1 className="text-xl font-semibold tracking-tight text-slate-900 dark:text-zinc-50">
                {NAV.find((n) => n.id === nav)?.label}
              </h1>
              {flash && (
                <span className="max-w-md truncate text-xs text-slate-500 dark:text-zinc-400">
                  {flash}
                </span>
              )}
            </header>

            <div className="min-h-0 flex-1 overflow-auto p-6">
              {nav === "services" && (
                <div className="grid gap-4 sm:grid-cols-3">
                  {SERVICES.map((s) => {
                    const st = status?.[s.id];
                    const running = serviceIsRunning(st);
                    const isHelios = s.id === "helios";
                    const tone = isHelios ? heliosTone(st) : undefined;
                    const badgeLabel = isHelios
                      ? tone!
                      : running
                        ? "up"
                        : "down";
                    const subtext = (() => {
                      if (isHelios) {
                        if (tone === "degraded") {
                          return `Degraded: ${st?.details || st?.detail || ""}`;
                        }
                        if (tone === "online") {
                          return st?.details || st?.detail || null;
                        }
                        return st?.details || st?.detail || null;
                      }
                      return st?.detail || null;
                    })();
                    return (
                      <div
                        key={s.id}
                        className="rounded-xl border border-slate-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900/40"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <h2 className="font-semibold text-slate-900 dark:text-zinc-100">
                              {s.title}
                            </h2>
                            <p className="mt-1 text-xs text-slate-500 dark:text-zinc-400">
                              {s.blurb}
                            </p>
                          </div>
                          {isHelios ? (
                            <StatusDot label={badgeLabel} tone={tone} />
                          ) : (
                            <StatusDot label={badgeLabel} on={running} />
                          )}
                        </div>
                        {subtext && (
                          <p className="mt-2 truncate font-mono text-[10px] text-zinc-500">
                            {subtext}
                          </p>
                        )}
                        <div className="mt-4 flex gap-2">
                          <button
                            type="button"
                            disabled={busyId === s.id || running}
                            onClick={() => void start(s.id)}
                            className="flex-1 rounded bg-primary px-3 py-2 text-sm font-medium text-white disabled:opacity-40"
                          >
                            Start
                          </button>
                          <button
                            type="button"
                            disabled={busyId === s.id || !running}
                            onClick={() => void stop(s.id)}
                            className="flex-1 rounded border border-slate-300 px-3 py-2 text-sm dark:border-zinc-700 disabled:opacity-40"
                          >
                            Stop
                          </button>
                          {isHelios && (
                            <button
                              type="button"
                              disabled={busyId === s.id}
                              onClick={() => void reset()}
                              className="flex-1 rounded bg-primary px-3 py-2 text-sm font-medium text-white disabled:opacity-40"
                            >
                              {resetting ? "Resetting…" : "Restart"}
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {nav === "terminal" && (
                <div className="h-[calc(100vh-8rem)] min-h-[420px]">
                  <LogViewer />
                </div>
              )}

              {nav === "reports" && <ReportHub />}

              {nav === "data" && <DataExplorer />}

              {nav === "settings" && <SettingsPanel />}
            </div>
          </div>

          {previewOpen && activeHitl && (
            <HitlWorkspace
              item={activeHitl}
              onClose={() => setPreviewOpen(false)}
              onOpenHub={() => void openUploadHub(activeHitl)}
            />
          )}
        </div>
      </main>
    </div>
  );
}

function HitlAlertBar({
  item,
  queueCount,
  onOpenHub,
  onPreview,
}: {
  item: HitlQueueItem;
  queueCount: number;
  onOpenHub: () => void;
  onPreview: () => void;
}) {
  const runSnippet =
    item.id && item.id.length > 12 ? `${item.id.slice(0, 8)}…` : item.id;
  const session = item.uploadSessionId;
  const fileLabel =
    queueCount <= 1
      ? item.fileName || "unknown file"
      : `${item.fileName || "unknown"} (+${queueCount - 1} more)`;

  return (
    <div
      role="alert"
      className="flex flex-wrap items-center justify-between gap-3 border-b border-amber-400/60 bg-amber-100 px-6 py-3 text-amber-950 dark:border-amber-500/40 dark:bg-amber-950/80 dark:text-amber-100"
    >
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold tracking-tight">
          Human review required
        </div>
        <div className="mt-0.5 truncate text-xs text-amber-900/80 dark:text-amber-200/80">
          {queueCount} run{queueCount === 1 ? "" : "s"} waiting
          {" · "}
          <span className="font-medium">{fileLabel}</span>
          {runSnippet && (
            <>
              {" · "}
              run <span className="font-mono">{runSnippet}</span>
            </>
          )}
          {session && (
            <>
              {" · "}
              session <span className="font-mono">{session.slice(0, 16)}</span>
              {session.length > 16 ? "…" : ""}
            </>
          )}
        </div>
      </div>
      <div className="flex shrink-0 gap-2">
        <button
          type="button"
          onClick={onPreview}
          className="rounded-md border border-amber-600/40 bg-white/80 px-3 py-1.5 text-sm font-medium text-amber-950 hover:bg-white dark:border-amber-400/30 dark:bg-amber-900/40 dark:text-amber-100"
        >
          Preview
        </button>
        <button
          type="button"
          onClick={onOpenHub}
          className="rounded-md bg-amber-500 px-3 py-1.5 text-sm font-medium text-amber-950 shadow-sm hover:bg-amber-400 dark:bg-amber-400 dark:hover:bg-amber-300"
        >
          Open in Upload Hub
        </button>
      </div>
    </div>
  );
}

type StatusTone = "online" | "degraded" | "offline" | "on" | "off";

function StatusDot({
  label,
  on,
  tone,
}: {
  label: string;
  on?: boolean;
  tone?: StatusTone;
}) {
  const resolved: StatusTone =
    tone ?? (on ? "on" : "off");

  const styles: Record<
    StatusTone,
    { wrap: string; dot: string }
  > = {
    online: {
      wrap: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
      dot: "bg-emerald-500",
    },
    on: {
      wrap: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
      dot: "bg-emerald-500",
    },
    degraded: {
      wrap: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
      dot: "bg-amber-500",
    },
    offline: {
      wrap: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
      dot: "bg-red-500",
    },
    off: {
      wrap: "bg-slate-100 text-slate-600 dark:bg-zinc-800 dark:text-zinc-400",
      dot: "bg-slate-400",
    },
  };

  const { wrap, dot } = styles[resolved];

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium uppercase ${wrap}`}
      title={label}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
      {label}
    </span>
  );
}
