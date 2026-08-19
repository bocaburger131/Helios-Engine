"use client";

import Link from "next/link";
import type { PresetId } from "@/lib/workspaceLayout";
import { PRESET_LABELS } from "@/lib/workspaceLayout";

type Props = {
  statementId: string;
  onViewJson?: () => void;
  onViewAuditTrail?: () => void;
  onSaveLayout?: () => void;
  onResetLayout?: () => void;
  onApplyPreset?: (id: PresetId) => void;
  layoutSavedFlash?: boolean;
};

const PRESET_OPTIONS: PresetId[] = [
  "underwriter",
  "auditor",
  "executive",
  "default",
];

export default function ResultsToolbar({
  statementId,
  onViewJson,
  onViewAuditTrail,
  onSaveLayout,
  onResetLayout,
  onApplyPreset,
  layoutSavedFlash,
}: Props) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--helios-border)] pb-4 dark:border-slate-800">
      <Link
        href="/results"
        className="text-sm text-blue-600 hover:underline dark:text-blue-400"
      >
        ← Back to results
      </Link>
      <div className="flex flex-wrap items-center gap-2 sm:gap-3">
        {onSaveLayout && (
          <button
            type="button"
            onClick={onSaveLayout}
            className="helios-btn helios-btn-secondary py-1.5 text-xs dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
          >
            {layoutSavedFlash ? "Saved" : "Save Layout"}
          </button>
        )}
        {onResetLayout && (
          <button
            type="button"
            onClick={onResetLayout}
            className="helios-btn helios-btn-secondary py-1.5 text-xs dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
          >
            Reset Grid
          </button>
        )}
        {onApplyPreset && (
          <label className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300">
            <span className="sr-only sm:not-sr-only">Preset Layouts</span>
            <select
              className="rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-800 outline-none focus:border-[#3366a9] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
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
        {onViewJson && (
          <button
            type="button"
            onClick={onViewJson}
            className="helios-btn helios-btn-secondary py-1.5 text-xs dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
          >
            View JSON
          </button>
        )}
        {onViewAuditTrail && (
          <button
            type="button"
            onClick={onViewAuditTrail}
            className="helios-btn helios-btn-secondary py-1.5 text-xs dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
          >
            View AI Audit Trail
          </button>
        )}
        <span className="font-mono text-xs text-slate-500 dark:text-slate-400">
          {statementId}
        </span>
      </div>
    </div>
  );
}
