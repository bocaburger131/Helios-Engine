"use client";

import {
  PROCESS_WIDGET_IDS,
  RESULTS_WIDGET_IDS,
  WIDGET_LABELS,
  isWidgetVisible,
  type WidgetId,
} from "@/lib/workspaceLayout";

type Props = {
  open: boolean;
  onClose: () => void;
  visible: Partial<Record<WidgetId, boolean>>;
  onToggle: (id: WidgetId, next: boolean) => void;
};

function CheckboxRow({
  id,
  checked,
  onToggle,
}: {
  id: WidgetId;
  checked: boolean;
  onToggle: (id: WidgetId, next: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-slate-800 bg-slate-900/80 px-3 py-2.5 hover:border-[#3366a9]">
      <input
        type="checkbox"
        className="h-4 w-4 rounded border-slate-600 bg-slate-950 text-[#3366a9] focus:ring-[#3366a9]"
        checked={checked}
        onChange={(e) => onToggle(id, e.target.checked)}
      />
      <span className="text-sm text-slate-200">{WIDGET_LABELS[id]}</span>
    </label>
  );
}

export default function WidgetRegistryDrawer({
  open,
  onClose,
  visible,
  onToggle,
}: Props) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal>
      <button
        type="button"
        className="absolute inset-0 bg-black/50"
        aria-label="Close widget registry"
        onClick={onClose}
      />
      <aside className="relative flex h-full w-full max-w-md flex-col border-l border-slate-800 bg-slate-950 shadow-2xl">
        <header className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-100">
              Widget Registry
            </h2>
            <p className="text-[11px] text-slate-400">
              Toggle components on or off. Hidden widgets recompact the grid.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded px-2 py-1 text-xs text-slate-400 hover:bg-slate-800 hover:text-slate-100"
          >
            Close
          </button>
        </header>

        <div className="min-h-0 flex-1 space-y-6 overflow-auto p-4">
          <section>
            <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-sky-400">
              Financial Analysis
            </h3>
            <div className="space-y-2">
              {RESULTS_WIDGET_IDS.map((id) => (
                <CheckboxRow
                  key={id}
                  id={id}
                  checked={isWidgetVisible(visible, id)}
                  onToggle={onToggle}
                />
              ))}
            </div>
          </section>

          <section>
            <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
              System Process
            </h3>
            <div className="space-y-2">
              {PROCESS_WIDGET_IDS.map((id) => (
                <CheckboxRow
                  key={id}
                  id={id}
                  checked={isWidgetVisible(visible, id)}
                  onToggle={onToggle}
                />
              ))}
            </div>
          </section>
        </div>
      </aside>
    </div>
  );
}
