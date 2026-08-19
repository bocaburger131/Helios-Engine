"use client";

import type { ReactNode } from "react";

export type WidgetVariant = "results" | "process";

type Props = {
  title: string;
  minimized: boolean;
  onToggleMinimize: () => void;
  children: ReactNode;
  headerExtra?: ReactNode;
  /**
   * results = sky financial-analysis chrome
   * process = dark navy system/telemetry chrome
   */
  variant?: WidgetVariant;
  /** When false, hide drag grip (Custom Layout Mode off). */
  editable?: boolean;
};

const CARD_SHADOW = "shadow-sm shadow-slate-200/50 dark:shadow-none";

function GripIcon({ process }: { process?: boolean }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 16 16"
      fill="currentColor"
      aria-hidden
      className={process ? "text-process-text" : "text-results-text"}
    >
      <circle cx="5" cy="4" r="1.2" />
      <circle cx="11" cy="4" r="1.2" />
      <circle cx="5" cy="8" r="1.2" />
      <circle cx="11" cy="8" r="1.2" />
      <circle cx="5" cy="12" r="1.2" />
      <circle cx="11" cy="12" r="1.2" />
    </svg>
  );
}

export default function WidgetShell({
  title,
  minimized,
  onToggleMinimize,
  children,
  headerExtra,
  variant = "results",
  editable = false,
}: Props) {
  const isProcess = variant === "process";

  return (
    <div
      className={
        isProcess
          ? `flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-process-border bg-process-bg text-process-text ${CARD_SHADOW} transition-colors hover:border-brand-blue`
          : `flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-results-border bg-results-bg text-slate-800 ${CARD_SHADOW} transition-colors hover:border-brand-blue dark:text-slate-100`
      }
    >
      <header
        className={
          isProcess
            ? "flex shrink-0 items-center gap-2 border-b border-process-border px-2 py-1.5"
            : "flex shrink-0 items-center gap-2 border-b border-results-border bg-results-bg/80 px-2 py-1.5"
        }
      >
        {editable && (
          <button
            type="button"
            className={
              isProcess
                ? "widget-drag-handle flex cursor-grab items-center rounded p-1 hover:bg-process-border active:cursor-grabbing"
                : "widget-drag-handle flex cursor-grab items-center rounded p-1 hover:bg-results-border/60 active:cursor-grabbing"
            }
            aria-label={`Drag ${title}`}
            title="Drag"
          >
            <GripIcon process={isProcess} />
          </button>
        )}
        <h3
          className={
            isProcess
              ? "min-w-0 flex-1 truncate text-xs font-semibold uppercase tracking-wide text-slate-200"
              : "min-w-0 flex-1 truncate text-xs font-semibold uppercase tracking-wide text-results-text"
          }
        >
          {title}
        </h3>
        {headerExtra}
        <button
          type="button"
          onClick={onToggleMinimize}
          className={
            isProcess
              ? "rounded px-1.5 py-0.5 text-[10px] font-medium text-process-text hover:bg-process-border hover:text-brand-blue"
              : "rounded px-1.5 py-0.5 text-[10px] font-medium text-results-text hover:bg-results-border/60 hover:text-brand-blue"
          }
          aria-label={minimized ? `Maximize ${title}` : `Minimize ${title}`}
          title={minimized ? "Maximize" : "Minimize"}
        >
          {minimized ? "▢" : "—"}
        </button>
      </header>
      {!minimized && (
        <div
          className={
            isProcess
              ? "min-h-0 flex-1 overflow-auto p-3 text-process-text"
              : "min-h-0 flex-1 overflow-auto p-3 text-slate-800 dark:text-slate-100"
          }
        >
          {children}
        </div>
      )}
    </div>
  );
}
