"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import HitlResolveForm, {
  correctionsFromReviewPayload,
} from "@/components/upload/HitlResolveForm";

const SmartPdfViewer = dynamic(
  () => import("@/components/upload/SmartPdfViewer"),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full items-center justify-center p-4 text-xs text-slate-500">
        Loading PDF viewer…
      </div>
    ),
  }
);

export type HitlWorkspaceProps = {
  processingRunId: string;
  fileName?: string | null;
  reviewPayload?: Record<string, unknown> | null;
  /** Staged File from the current session (preferred). */
  file?: File | null;
  /** Blob/object URL when File is unavailable (e.g. deep-link + triage fetch). */
  pdfUrl?: string | null;
  onClose?: () => void;
  onResolved?: (result: Record<string, unknown>) => void;
  onError?: (message: string) => void;
};

function asNum(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function firstFilePayload(
  reviewPayload?: Record<string, unknown> | null
): Record<string, unknown> | null {
  const files = Array.isArray(reviewPayload?.files) ? reviewPayload.files : [];
  const first = files[0];
  return first && typeof first === "object"
    ? (first as Record<string, unknown>)
    : null;
}

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" ? (v as Record<string, unknown>) : null;
}

/**
 * Resolve a 1-based PDF page from HITL review payload fields when present.
 */
export function targetPageFromReviewPayload(
  reviewPayload?: Record<string, unknown> | null,
  fileMeta?: Record<string, unknown> | null
): number | undefined {
  const meta = fileMeta ?? firstFilePayload(reviewPayload);
  const nested = [
    meta,
    reviewPayload,
    asRecord(meta?.aiDiagnostic),
    asRecord(meta?.reconciliationBreakdown),
    asRecord(meta?.checksumRecon),
    asRecord(meta?.checksumDeltaProbe),
  ].filter(Boolean) as Record<string, unknown>[];

  for (const obj of nested) {
    const pageNumber = asNum(obj.pageNumber);
    if (pageNumber != null && pageNumber >= 1) {
      return Math.floor(pageNumber);
    }
  }

  for (const obj of nested) {
    const pageIndex = asNum(obj.pageIndex);
    if (pageIndex == null) continue;
    // Treat as 0-based when pageNumber was absent (common in layout pipeline).
    if (pageIndex >= 0) {
      return Math.floor(pageIndex) + 1;
    }
  }

  return undefined;
}

function formatMoney(n: number | null): string {
  if (n == null) return "—";
  return n.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/**
 * Split HITL panel: PDF preview + checksum math / ledger corrections.
 * Mounted in Upload Hub right aside when status is REQUIRES_HUMAN_REVIEW.
 */
export default function HitlWorkspace({
  processingRunId,
  fileName,
  reviewPayload,
  file,
  pdfUrl: pdfUrlProp,
  onClose,
  onResolved,
  onError,
}: HitlWorkspaceProps) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!file) {
      setBlobUrl(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setBlobUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const pdfSrc = blobUrl || pdfUrlProp || null;

  const fileMeta = useMemo(() => firstFilePayload(reviewPayload), [reviewPayload]);
  const targetPageNumber = useMemo(
    () => targetPageFromReviewPayload(reviewPayload, fileMeta),
    [reviewPayload, fileMeta]
  );

  const recon = useMemo(() => {
    if (!fileMeta) return {};
    const breakdown =
      fileMeta.reconciliationBreakdown &&
      typeof fileMeta.reconciliationBreakdown === "object"
        ? (fileMeta.reconciliationBreakdown as Record<string, unknown>)
        : null;
    const checksum =
      fileMeta.checksumRecon && typeof fileMeta.checksumRecon === "object"
        ? (fileMeta.checksumRecon as Record<string, unknown>)
        : null;
    return { ...(checksum || {}), ...(breakdown || {}) };
  }, [fileMeta]);

  const extractedDeposits = asNum(recon.deposits ?? recon.parsedDeposits);
  const printedDeposits = asNum(recon.printedDeposits);
  const extractedWithdrawals = asNum(recon.withdrawals ?? recon.parsedWithdrawals);
  const printedWithdrawals = asNum(recon.printedWithdrawals);
  const delta = asNum(recon.delta);
  const displayName =
    fileName ||
    (typeof fileMeta?.fileName === "string" ? fileMeta.fileName : null) ||
    file?.name ||
    "statement.pdf";

  const defaults = correctionsFromReviewPayload(reviewPayload);

  return (
    <div className="flex h-full min-h-0 flex-col bg-white">
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-[var(--helios-border)] bg-amber-50 px-3 py-2.5">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-amber-900">
            Human review
          </p>
          <p className="truncate text-sm font-medium text-slate-800" title={displayName}>
            {displayName}
          </p>
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded border border-amber-200 bg-white px-2 py-1 text-xs text-slate-600 hover:bg-amber-100"
          >
            Close
          </button>
        )}
      </div>

      <div className="relative min-h-[220px] flex-1 border-b border-[var(--helios-border)] bg-slate-100">
        {pdfSrc ? (
          <div className="absolute inset-0">
            <SmartPdfViewer
              fileUrl={pdfSrc}
              targetPageNumber={targetPageNumber}
              title={displayName}
            />
          </div>
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-1 p-4 text-center">
            <p className="text-sm font-medium text-slate-700">PDF unavailable</p>
            <p className="text-xs text-slate-500">
              Stage the file again or open from a session that still has the triage PDF.
            </p>
          </div>
        )}
      </div>

      <div className="max-h-[48%] shrink-0 overflow-y-auto p-3">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Checksum comparison
        </h3>
        <dl className="mt-2 grid grid-cols-2 gap-2 text-xs">
          <div className="rounded border border-slate-200 bg-slate-50 p-2">
            <dt className="text-slate-500">Extracted deposits</dt>
            <dd className="mt-0.5 font-mono text-sm font-medium text-slate-900">
              {formatMoney(extractedDeposits)}
            </dd>
          </div>
          <div className="rounded border border-slate-200 bg-slate-50 p-2">
            <dt className="text-slate-500">Printed deposits</dt>
            <dd className="mt-0.5 font-mono text-sm font-medium text-slate-900">
              {formatMoney(printedDeposits ?? defaults.totalDeposits)}
            </dd>
          </div>
          <div className="rounded border border-slate-200 bg-slate-50 p-2">
            <dt className="text-slate-500">Extracted withdrawals</dt>
            <dd className="mt-0.5 font-mono text-sm font-medium text-slate-900">
              {formatMoney(extractedWithdrawals)}
            </dd>
          </div>
          <div className="rounded border border-slate-200 bg-slate-50 p-2">
            <dt className="text-slate-500">Printed withdrawals</dt>
            <dd className="mt-0.5 font-mono text-sm font-medium text-slate-900">
              {formatMoney(printedWithdrawals ?? defaults.totalWithdrawals)}
            </dd>
          </div>
          <div className="col-span-2 rounded border border-amber-200 bg-amber-50/80 p-2">
            <dt className="text-amber-800">Delta</dt>
            <dd className="mt-0.5 font-mono text-sm font-semibold text-amber-950">
              {formatMoney(delta)}
            </dd>
          </div>
        </dl>

        <div className="mt-3">
          <HitlResolveForm
            key={processingRunId}
            processingRunId={processingRunId}
            fileName={displayName}
            reviewPayload={reviewPayload}
            onResolved={onResolved}
            onError={onError}
          />
        </div>
      </div>
    </div>
  );
}
