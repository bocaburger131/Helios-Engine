"use client";

import ReactMarkdown from "react-markdown";
import WidgetShell from "@/components/widgets/WidgetShell";

type Props = {
  markdown: string | null;
  decision?: string | null;
  score?: number | null;
  minimized: boolean;
  onToggleMinimize: () => void;
  editable?: boolean;
};

export default function WidgetVeraBriefing({
  markdown,
  decision,
  score,
  minimized,
  onToggleMinimize,
  editable = false,
}: Props) {
  return (
    <WidgetShell
      title="Vera Underwriting"
      minimized={minimized}
      onToggleMinimize={onToggleMinimize}
      variant="results"
      editable={editable}
      headerExtra={
        decision ? (
          <span className="rounded bg-sky-100 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-sky-700 dark:bg-sky-900/50 dark:text-sky-300">
            {decision}
            {score != null ? ` · ${score}` : ""}
          </span>
        ) : null
      }
    >
      {!markdown ? (
        <p className="text-sm text-slate-500">
          No Vera briefing available for this statement.
        </p>
      ) : (
        <div className="prose-vera max-w-none text-sm text-slate-700">
          <ReactMarkdown
            components={{
              h2: ({ children }) => (
                <h4 className="mt-4 mb-1 text-sm font-semibold text-sky-700 first:mt-0 dark:text-sky-300">
                  {children}
                </h4>
              ),
              p: ({ children }) => (
                <p className="mb-2 leading-relaxed text-slate-700 dark:text-slate-200">
                  {children}
                </p>
              ),
              ul: ({ children }) => (
                <ul className="mb-3 list-disc space-y-1 pl-4 text-slate-700 dark:text-slate-200">
                  {children}
                </ul>
              ),
              strong: ({ children }) => (
                <strong className="font-semibold text-slate-900 dark:text-slate-100">
                  {children}
                </strong>
              ),
            }}
          >
            {markdown}
          </ReactMarkdown>
        </div>
      )}
    </WidgetShell>
  );
}
