"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { API_BASE } from "@/lib/apiClient";

export type PollingStatus = "idle" | "polling" | "COMPLETED" | "FAILED" | "REQUIRES_HUMAN_REVIEW";

export type ReviewPayload = {
  checksumDelta: number;
  extractedRows: Array<Record<string, unknown>>;
  anomalies?: string[];
};

export type PollingResult = {
  status: PollingStatus;
  reviewPayload: ReviewPayload | null;
};

export function useStatementPolling(runId: string | null) {
  const [result, setResult] = useState<PollingResult>({
    status: "idle",
    reviewPayload: null,
  });
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortedRef = useRef(false);

  const poll = useCallback(async () => {
    if (!runId || abortedRef.current) return;

    setResult({ status: "polling", reviewPayload: null });

    try {
      const res = await fetch(`${API_BASE}/api/processing-runs/${runId}/status`, {
        headers: { Accept: "application/json" },
      });

      if (!res.ok) {
        throw new Error(`Poll failed (${res.status})`);
      }

      const json = await res.json();
      const status: PollingStatus = json.status ?? "idle";
      const reviewPayload: ReviewPayload | null = json.reviewPayload ?? null;

      setResult({ status, reviewPayload });

      if (
        status === "COMPLETED" ||
        status === "FAILED" ||
        status === "REQUIRES_HUMAN_REVIEW"
      ) {
        return;
      }

      timerRef.current = setTimeout(poll, 2000);
    } catch {
      timerRef.current = setTimeout(poll, 2000);
    }
  }, [runId]);

  useEffect(() => {
    abortedRef.current = false;
    if (!runId) {
      setResult({ status: "idle", reviewPayload: null });
      return;
    }
    poll();

    return () => {
      abortedRef.current = true;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [runId, poll]);

  return result;
}
