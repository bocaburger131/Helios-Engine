"use client";

import type { TelemetryEvent, TelemetryStatus } from "@/lib/parseTelemetryTimeline";

const AI_ACCENT = "#3366a9";

type Props = {
  open: boolean;
  onClose: () => void;
  events: TelemetryEvent[];
};

function formatDuration(ms: number | null | undefined): string {
  if (ms == null || !Number.isFinite(ms)) return "—";
  if (ms < 1000) return `${Math.round(ms)}ms`;
  const sec = ms / 1000;
  return sec >= 10 ? `${sec.toFixed(1)}s` : `${sec.toFixed(2)}s`;
}

function formatCost(event: TelemetryEvent): string {
  if (event.costDisplay) return event.costDisplay;
  if (event.costUsd == null || !Number.isFinite(event.costUsd)) return "—";
  if (event.costUsd < 0.01) return "< $0.01";
  return `$${event.costUsd.toFixed(3)}`;
}

function statusBadgeClass(status: TelemetryStatus): string {
  switch (status) {
    case "success":
      return "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-200";
    case "failed":
      return "bg-rose-100 text-rose-800 dark:bg-rose-900/50 dark:text-rose-200";
    case "rescued":
      return "bg-amber-100 text-amber-900 dark:bg-amber-900/50 dark:text-amber-100";
    case "skipped":
      return "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300";
    case "info":
    default:
      return "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200";
  }
}

function statusLabel(status: TelemetryStatus): string {
  switch (status) {
    case "success":
      return "Success";
    case "failed":
      return "Failed";
    case "rescued":
      return "Rescued";
    case "skipped":
      return "Skipped";
    case "info":
      return "Info";
    default:
      return status;
  }
}

function railColor(event: TelemetryEvent): string {
  if (event.aiDriven) return AI_ACCENT;
  if (event.status === "failed") return "#e11d48";
  if (event.status === "rescued" || event.warning) return "#d97706";
  if (event.status === "success") return "#059669";
  return "#94a3b8";
}

export default function AiTelemetryTimeline({ open, onClose, events }: Props) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true">
      <button
        type="button"
        className="absolute inset-0 bg-black/40"
        aria-label="Close AI Audit Trail"
        onClick={onClose}
      />
      <aside
        className="relative flex h-full w-[min(100vw,420px)] flex-col border-l border-[var(--helios-border)] bg-white shadow-xl dark:border-slate-700 dark:bg-slate-950"
        style={{ borderLeftColor: undefined }}
      >
        <header className="flex items-center justify-between gap-3 border-b border-[var(--helios-border)] px-4 py-3 dark:border-slate-700">
          <div>
            <h2 className="text-sm font-semibold tracking-tight text-slate-900 dark:text-slate-100">
              AI Audit Trail
            </h2>
            <p className="mt-0.5 font-mono text-[10px] uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Extraction · cost · latency
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="helios-btn helios-btn-secondary py-1 px-2 text-xs"
          >
            Close
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-4 py-5">
          {events.length === 0 ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">
              No telemetry recorded for this statement.
            </p>
          ) : (
            <ol className="relative space-y-0">
              {events.map((event, index) => {
                const color = railColor(event);
                const isLast = index === events.length - 1;
                return (
                  <li key={event.id} className="relative flex gap-3 pb-6 last:pb-0">
                    {!isLast && (
                      <span
                        className="absolute left-[7px] top-4 bottom-0 w-px"
                        style={{ backgroundColor: color, opacity: 0.35 }}
                        aria-hidden
                      />
                    )}
                    <span
                      className="relative z-10 mt-1.5 h-3.5 w-3.5 shrink-0 rounded-full border-2 bg-white dark:bg-slate-950"
                      style={{ borderColor: color }}
                      aria-hidden
                    />
                    <div
                      className={`min-w-0 flex-1 rounded-lg border px-3 py-2.5 ${
                        event.aiDriven
                          ? "border-[#3366a9]/40 bg-[#3366a9]/5 dark:border-[#3366a9]/50 dark:bg-[#3366a9]/10"
                          : event.status === "failed"
                            ? "border-rose-200 bg-rose-50/60 dark:border-rose-800 dark:bg-rose-950/40"
                            : "border-slate-200 bg-slate-50/80 dark:border-slate-700 dark:bg-slate-900/60"
                      }`}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <p
                          className="text-sm font-medium text-slate-900 dark:text-slate-100"
                          style={
                            event.aiDriven ? { color: AI_ACCENT } : undefined
                          }
                        >
                          {event.name}
                        </p>
                        <div className="flex flex-wrap gap-1">
                          <span
                            className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${statusBadgeClass(event.status)}`}
                          >
                            {statusLabel(event.status)}
                          </span>
                          {event.warning && (
                            <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-900 dark:bg-amber-900/60 dark:text-amber-100">
                              Provider Fallback
                            </span>
                          )}
                        </div>
                      </div>
                      {event.detail && (
                        <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
                          {event.detail}
                        </p>
                      )}
                      <dl className="mt-2 flex flex-wrap gap-x-4 gap-y-1 font-mono text-[11px] text-slate-700 dark:text-slate-300">
                        <div>
                          <dt className="inline text-slate-400 dark:text-slate-500">
                            duration{" "}
                          </dt>
                          <dd className="inline">{formatDuration(event.durationMs)}</dd>
                        </div>
                        <div>
                          <dt className="inline text-slate-400 dark:text-slate-500">
                            cost{" "}
                          </dt>
                          <dd className="inline">{formatCost(event)}</dd>
                        </div>
                      </dl>
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </div>
      </aside>
    </div>
  );
}
