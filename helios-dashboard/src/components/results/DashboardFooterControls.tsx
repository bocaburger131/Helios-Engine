"use client";

import type { PresetId } from "@/lib/workspaceLayout";
import { PRESET_LABELS } from "@/lib/workspaceLayout";

type Props = {
  layoutEditMode: boolean;
  onToggleLayoutEditMode: () => void;
  onOpenRegistry: () => void;
  onSaveLayout?: () => void;
  onResetLayout?: () => void;
  onApplyPreset?: (id: PresetId) => void;
  onViewAuditTrail?: () => void;
  layoutSavedFlash?: boolean;
};

const PRESET_OPTIONS: PresetId[] = [
  "underwriter",
  "auditor",
  "executive",
  "default",
];

export default function DashboardFooterControls({
  layoutEditMode,
  onToggleLayoutEditMode,
  onOpenRegistry,
  onSaveLayout,
  onResetLayout,
  onApplyPreset,
  onViewAuditTrail,
  layoutSavedFlash,
}: Props) {
  return (
    <footer
      className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-800 bg-slate-950/95 px-3 py-2.5 shadow-[0_-8px_24px_rgba(0,0,0,0.35)] backdrop-blur-md"
      style={{ paddingBottom: "max(0.625rem, env(safe-area-inset-bottom))" }}
    >
      <div className="mx-auto flex w-full max-w-[1400px] flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onToggleLayoutEditMode}
            aria-pressed={layoutEditMode}
            className={
              layoutEditMode
                ? "rounded-lg border border-[#3366a9] bg-[#3366a9] px-3 py-1.5 text-xs font-semibold text-white shadow-sm"
                : "rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:border-[#3366a9]"
            }
          >
            {layoutEditMode ? "Custom Layout Mode · On" : "Custom Layout Mode"}
          </button>
          <button
            type="button"
            onClick={onOpenRegistry}
            className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-medium text-slate-200 hover:border-sky-500 hover:text-sky-300"
          >
            Add/Remove Components
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {onApplyPreset && (
            <label className="flex items-center gap-1.5 text-xs text-slate-400">
              <span className="sr-only sm:not-sr-only">Presets</span>
              <select
                className="rounded-md border border-slate-700 bg-slate-900 px-2 py-1.5 text-xs text-slate-100 outline-none focus:border-[#3366a9]"
                defaultValue=""
                onChange={(e) => {
                  const v = e.target.value as PresetId | "";
                  if (v) onApplyPreset(v);
                  e.target.value = "";
                }}
              >
                <option value="" disabled>
                  Preset Layouts…
                </option>
                {PRESET_OPTIONS.map((id) => (
                  <option key={id} value={id}>
                    {PRESET_LABELS[id]}
                  </option>
                ))}
              </select>
            </label>
          )}
          {onSaveLayout && (
            <button
              type="button"
              onClick={onSaveLayout}
              className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-medium text-slate-200 hover:border-[#3366a9]"
            >
              {layoutSavedFlash ? "Saved" : "Save Layout"}
            </button>
          )}
          {layoutEditMode && onResetLayout && (
            <button
              type="button"
              onClick={onResetLayout}
              className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-medium text-slate-400 hover:border-rose-600 hover:text-rose-300"
            >
              Reset Grid
            </button>
          )}
          {onViewAuditTrail && (
            <button
              type="button"
              onClick={onViewAuditTrail}
              className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-medium text-slate-200 hover:border-[#3366a9]"
            >
              View AI Audit Trail
            </button>
          )}
        </div>
      </div>
    </footer>
  );
}
