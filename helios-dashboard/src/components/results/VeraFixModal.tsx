"use client";

import { useState } from "react";
import { API_BASE, authHeaders } from "@/lib/apiClient";

export type DeltaFix = {
  field?: string;
  proposedValue?: number | string;
  confidence?: number;
  rationale?: string;
};

type Props = {
  open: boolean;
  onClose: () => void;
  statementId: string;
  deltaFixes: DeltaFix[];
  onResolved?: () => void;
};

export default function VeraFixModal({
  open,
  onClose,
  statementId,
  deltaFixes,
  onResolved,
}: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [decisions, setDecisions] = useState<Record<number, "accept" | "reject">>({});

  if (!open) return null;

  const submit = async (accept: boolean) => {
    setBusy(true);
    setError(null);
    try {
      const acceptedFixes = deltaFixes.filter((_, i) =>
        accept ? decisions[i] === "accept" || Object.keys(decisions).length === 0 : false
      );

      const res = await fetch(`${API_BASE}/api/statements/${statementId}/verify`, {
        method: "PATCH",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({
          veraFixDecisions: deltaFixes.map((fix, i) => ({
            ...fix,
            decision: decisions[i] ?? (accept ? "accept" : "reject"),
          })),
          acceptedFixes,
        }),
      });

      if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new Error(body.slice(0, 200) || `Verify failed (${res.status})`);
      }

      onResolved?.();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to submit");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="flex max-h-[90vh] w-full max-w-lg flex-col rounded-xl bg-white shadow-xl">
        <div className="border-b px-4 py-3">
          <h2 className="text-lg font-semibold text-slate-900">Vera AI reconciliation fixes</h2>
          <p className="text-sm text-slate-600">
            Review proposed corrections for checksum / fee discrepancies.
          </p>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          {deltaFixes.length === 0 ? (
            <p className="text-sm text-slate-500">
              No automated fixes proposed. Vera may still flag items for manual review.
            </p>
          ) : (
            <ul className="space-y-3">
              {deltaFixes.map((fix, i) => (
                <li key={`${fix.field}-${i}`} className="rounded-lg border border-slate-200 p-3">
                  <p className="font-medium text-slate-900">{fix.field}</p>
                  <p className="text-sm text-slate-700">
                    Proposed: {String(fix.proposedValue ?? "—")}
                    {fix.confidence != null && (
                      <span className="ml-2 text-xs text-slate-500">
                        {Math.round(fix.confidence * 100)}% confidence
                      </span>
                    )}
                  </p>
                  {fix.rationale && (
                    <p className="mt-1 text-xs text-slate-500">{fix.rationale}</p>
                  )}
                  <div className="mt-2 flex gap-2">
                    <button
                      type="button"
                      onClick={() => setDecisions((d) => ({ ...d, [i]: "accept" }))}
                      className={`rounded px-2 py-1 text-xs ${
                        decisions[i] === "accept"
                          ? "bg-emerald-600 text-white"
                          : "bg-slate-100 text-slate-700"
                      }`}
                    >
                      Accept
                    </button>
                    <button
                      type="button"
                      onClick={() => setDecisions((d) => ({ ...d, [i]: "reject" }))}
                      className={`rounded px-2 py-1 text-xs ${
                        decisions[i] === "reject"
                          ? "bg-rose-600 text-white"
                          : "bg-slate-100 text-slate-700"
                      }`}
                    >
                      Reject
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
          {error && <p className="mt-3 text-sm text-rose-700">{error}</p>}
        </div>
        <div className="flex justify-end gap-2 border-t px-4 py-3">
          <button type="button" onClick={onClose} className="helios-btn helios-btn-secondary">
            Cancel
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => submit(true)}
            className="helios-btn helios-btn-primary"
          >
            {busy ? "Saving…" : "Apply accepted fixes"}
          </button>
        </div>
      </div>
    </div>
  );
}
