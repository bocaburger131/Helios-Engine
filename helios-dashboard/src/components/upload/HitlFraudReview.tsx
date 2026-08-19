"use client";

import { useState } from "react";

type Props = {
  payload: {
    anomalies?: string[];
    checksumDelta: number;
    extractedRows?: Array<Record<string, unknown>>;
    runId?: string;
  };
};

export default function HitlFraudReview({ payload }: Props) {
  const [decision, setDecision] = useState<"approve" | "reject" | null>(
    null
  );

  const handleApprove = () => {
    setDecision("approve");
    console.log("[HITL-FRAUD] Approved exception — logging to audit trail");
  };

  const handleReject = () => {
    setDecision("reject");
    console.log("[HITL-FRAUD] Rejected deal — flagged as fraud");
  };

  const anomalies = payload.anomalies ?? [];

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-sm font-bold text-red-700">
        <span className="text-red-600">&#128308;</span>
        Fraud Review Required — Anomaly Detected
      </div>

      <div className="rounded-lg border-2 border-red-300 bg-red-50 px-4 py-3">
        <div className="text-xs font-semibold text-red-600 uppercase tracking-wide mb-2">
          Flagged Anomalies
        </div>
        {anomalies.length === 0 ? (
          <div className="text-sm text-red-500">No anomalies reported.</div>
        ) : (
          anomalies.map((anomaly, i) => (
            <div
              key={i}
              className="mb-2 rounded border border-red-200 bg-white px-3 py-2 text-sm"
            >
              <div className="font-semibold text-red-800">{anomaly}</div>
            </div>
          ))
        )}
      </div>

      {decision === null && (
        <div className="flex gap-3">
          <button
            type="button"
            onClick={handleApprove}
            className="helios-btn helios-btn-primary flex-1 border-emerald-600 bg-emerald-600 text-white hover:bg-emerald-700"
          >
            Approve Exception (Log to Audit)
          </button>
          <button
            type="button"
            onClick={handleReject}
            className="helios-btn flex-1 border-red-600 bg-red-600 text-white hover:bg-red-700"
          >
            Reject Deal (Flag as Fraud)
          </button>
        </div>
      )}

      {decision === "approve" && (
        <div className="rounded-lg border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">
          &#10003; Exception approved — logged to audit trail. Deal proceeding.
        </div>
      )}

      {decision === "reject" && (
        <div className="rounded-lg border border-red-300 bg-red-100 px-4 py-3 text-sm font-semibold text-red-800">
          &#10007; Deal rejected — flagged as fraud. Escalation triggered.
        </div>
      )}
    </div>
  );
}