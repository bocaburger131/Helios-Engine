"use client";

import { useMemo, useState } from "react";
import {
  redirectToDashboard,
  resolveProcessingRun,
} from "@/lib/batchUploadClient";
import { getStoredToken } from "@/lib/apiClient";

type Props = {
  processingRunId: string;
  fileName?: string | null;
  reviewPayload?: Record<string, unknown> | null;
  onResolved?: (result: Record<string, unknown>) => void;
  onError?: (message: string) => void;
};

function asFiniteNumber(v: unknown, fallback = 0): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export function correctionsFromReviewPayload(
  reviewPayload?: Record<string, unknown> | null
): {
  openingBalance: number;
  closingBalance: number;
  totalDeposits: number;
  totalWithdrawals: number;
} {
  const files = Array.isArray(reviewPayload?.files) ? reviewPayload.files : [];
  const first =
    files[0] && typeof files[0] === "object"
      ? (files[0] as Record<string, unknown>)
      : null;
  const recon =
    (first?.reconciliationBreakdown &&
    typeof first.reconciliationBreakdown === "object"
      ? (first.reconciliationBreakdown as Record<string, unknown>)
      : null) ||
    (first?.checksumRecon && typeof first.checksumRecon === "object"
      ? (first.checksumRecon as Record<string, unknown>)
      : null) ||
    {};

  return {
    openingBalance: asFiniteNumber(recon.opening),
    closingBalance: asFiniteNumber(recon.closing),
    totalDeposits: asFiniteNumber(recon.deposits),
    totalWithdrawals: asFiniteNumber(recon.withdrawals),
  };
}

export default function HitlResolveForm({
  processingRunId,
  fileName,
  reviewPayload,
  onResolved,
  onError,
}: Props) {
  const defaults = useMemo(
    () => correctionsFromReviewPayload(reviewPayload),
    [reviewPayload]
  );
  const [openingBalance, setOpeningBalance] = useState(String(defaults.openingBalance));
  const [closingBalance, setClosingBalance] = useState(String(defaults.closingBalance));
  const [totalDeposits, setTotalDeposits] = useState(String(defaults.totalDeposits));
  const [totalWithdrawals, setTotalWithdrawals] = useState(
    String(defaults.totalWithdrawals)
  );
  const [busy, setBusy] = useState(false);

  const rtn =
    Array.isArray(reviewPayload?.files) &&
    reviewPayload.files[0] &&
    typeof reviewPayload.files[0] === "object"
      ? String((reviewPayload.files[0] as Record<string, unknown>).rtn || "")
      : "";

  const submit = async () => {
    setBusy(true);
    try {
      const result = await resolveProcessingRun(
        processingRunId,
        {
          openingBalance: asFiniteNumber(openingBalance),
          closingBalance: asFiniteNumber(closingBalance),
          totalDeposits: asFiniteNumber(totalDeposits),
          totalWithdrawals: asFiniteNumber(totalWithdrawals),
        },
        {
          fileName: fileName || undefined,
          rtn: rtn || undefined,
        }
      );
      onResolved?.(result);
      const statementId = result.statementId ? String(result.statementId) : null;
      if (statementId) {
        redirectToDashboard(statementId, getStoredToken());
      }
    } catch (e) {
      onError?.(e instanceof Error ? e.message : "Resolve failed");
    } finally {
      setBusy(false);
    }
  };

  const field = (
    label: string,
    value: string,
    set: (v: string) => void
  ) => (
    <label className="block text-xs text-slate-600">
      <span className="mb-1 block font-medium text-slate-700">{label}</span>
      <input
        type="number"
        step="0.01"
        value={value}
        disabled={busy}
        onChange={(e) => set(e.target.value)}
        className="w-full rounded border border-slate-300 px-2 py-1.5 font-mono text-sm text-slate-900"
      />
    </label>
  );

  return (
    <div className="rounded-lg border border-violet-200 bg-violet-50/60 p-4">
      <h2 className="text-sm font-semibold text-violet-900">Human review — ledger corrections</h2>
      <p className="mt-1 text-xs text-violet-800">
        Confirm printed balances for
        {fileName ? (
          <>
            {" "}
            <strong>{fileName}</strong>
          </>
        ) : (
          " the failing statement"
        )}
        . Resolve graduates the bank template to VERIFIED.
      </p>
      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {field("Opening balance", openingBalance, setOpeningBalance)}
        {field("Closing balance", closingBalance, setClosingBalance)}
        {field("Total deposits", totalDeposits, setTotalDeposits)}
        {field("Total withdrawals", totalWithdrawals, setTotalWithdrawals)}
      </div>
      <button
        type="button"
        disabled={busy}
        onClick={submit}
        className="mt-4 rounded bg-violet-700 px-3 py-2 text-sm font-medium text-white hover:bg-violet-800 disabled:opacity-60"
      >
        {busy ? "Resolving…" : "Resolve & graduate"}
      </button>
    </div>
  );
}
