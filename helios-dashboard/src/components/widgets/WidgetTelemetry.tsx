"use client";

import WidgetShell from "@/components/widgets/WidgetShell";
import type { TelemetryEvent, TelemetryStatus } from "@/lib/parseTelemetryTimeline";

const AI_ACCENT = "#3366a9";

type Props = {
  events: TelemetryEvent[];
  minimized: boolean;
  onToggleMinimize: () => void;
  editable?: boolean;
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
      return "bg-emerald-900/50 text-emerald-200";
    case "failed":
      return "bg-rose-900/50 text-rose-200";
    case "rescued":
      return "bg-amber-900/50 text-amber-100";
    case "skipped":
      return "bg-slate-800 text-slate-300";
    default:
      return "bg-slate-800 text-slate-200";
  }
}

export default function WidgetTelemetry({
  events,
  minimized,
  onToggleMinimize,
  editable = false,
}: Props) {
  return (
    <WidgetShell
      title="AI Audit Trail"
      minimized={minimized}
      onToggleMinimize={onToggleMinimize}
      variant="process"
      editable={editable}
    >
      {events.length === 0 ? (
        <p className="text-sm text-slate-500 dark:text-slate-400">
          No telemetry recorded for this statement.
        </p>
      ) : (
        <ol className="space-y-2">
          {events.map((event) => (
            <li
              key={event.id}
              className={`rounded-lg border px-2.5 py-2 ${
                event.aiDriven
                  ? "border-[#3366a9]/40 bg-[#3366a9]/5 dark:bg-[#3366a9]/10"
                  : "border-slate-200 dark:border-slate-800"
              }`}
            >
              <div className="flex flex-wrap items-center justify-between gap-1">
                <p
                  className="text-xs font-medium text-slate-900 dark:text-slate-100"
                  style={event.aiDriven ? { color: AI_ACCENT } : undefined}
                >
                  {event.name}
                </p>
                <div className="flex flex-wrap gap-1">
                  <span
                    className={`rounded px-1 py-0.5 text-[9px] font-semibold uppercase ${statusBadgeClass(event.status)}`}
                  >
                    {event.status}
                  </span>
                  {event.warning && (
                    <span className="rounded bg-amber-100 px-1 py-0.5 text-[9px] font-semibold uppercase text-amber-900 dark:bg-amber-900/60 dark:text-amber-100">
                      Provider Fallback
                    </span>
                  )}
                </div>
              </div>
              <p className="mt-1 font-mono text-[10px] text-slate-600 dark:text-slate-400">
                {formatDuration(event.durationMs)} · {formatCost(event)}
              </p>
            </li>
          ))}
        </ol>
      )}
    </WidgetShell>
  );
}
