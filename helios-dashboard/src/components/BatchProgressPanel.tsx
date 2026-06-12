"use client";

import type { BatchProgress } from "@/lib/batchUploadClient";

function formatProgressLine(progress: BatchProgress | null): string {
  if (!progress) return "Waiting for worker…";
  if (progress.message) return progress.message;
  const phase = progress.phase || "";
  const file = progress.fileName ? ` (${progress.fileName})` : "";
  switch (phase) {
    case "checksum_recovery":
      return `Checksum rescue in progress${file}…`;
    case "checksum_recovery_complete":
      return "Checksum rescue succeeded — continuing analysis…";
    case "checksum_recovery_failed":
      return "Checksum rescue finished — verifying integrity…";
    case "dual_engine_parse":
      return `Cross-checking spatial tables${file}…`;
    case "pdf_plumber_rescue":
      return `Spatial extraction (pdfplumber)${file}…`;
    case "local_reparse":
      return "Re-parsing with learned layout…";
    default:
      return phase ? `${phase}${file}` : "Processing…";
  }
}

export default function BatchProgressPanel({
  phase,
  progress,
  busy,
}: {
  phase: "idle" | "triage" | "analyze" | "done" | "error";
  progress: BatchProgress | null;
  busy: boolean;
}) {
  const steps = [
    { id: "triage", label: "Classify" },
    { id: "analyze", label: "Analyze" },
    { id: "done", label: "Dashboard" },
  ] as const;

  const activeIdx =
    phase === "triage" ? 0 : phase === "analyze" ? 1 : phase === "done" ? 2 : -1;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex items-center justify-between gap-4">
        {steps.map((step, i) => (
          <div key={step.id} className="flex flex-1 flex-col items-center gap-2">
            <div
              className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold ${
                i <= activeIdx
                  ? "bg-slate-900 text-white"
                  : "bg-slate-100 text-slate-500"
              }`}
            >
              {i + 1}
            </div>
            <span
              className={`text-xs font-medium ${
                i === activeIdx ? "text-slate-900" : "text-slate-500"
              }`}
            >
              {step.label}
            </span>
          </div>
        ))}
      </div>

      {busy && (
        <div className="mt-6 rounded-lg bg-slate-50 px-4 py-3">
          <p className="text-sm font-medium text-slate-800">
            {phase === "triage" ? "Classifying PDFs…" : "Running macro analysis…"}
          </p>
          <p className="mt-1 text-sm text-slate-600">{formatProgressLine(progress)}</p>
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-200">
            <div className="h-full w-1/2 animate-pulse rounded-full bg-slate-700" />
          </div>
        </div>
      )}
    </div>
  );
}
