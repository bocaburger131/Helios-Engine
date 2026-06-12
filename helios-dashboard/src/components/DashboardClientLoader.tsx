"use client";

import { useEffect, useState } from "react";
import UnderwritingDashboard from "@/components/UnderwritingDashboard";
import { fetchStatementById, getStoredToken } from "@/lib/apiClient";
import type { HeliosStatementPayload } from "@/lib/analysisAdapter";

type Props = {
  statementId: string;
  initialPayload?: HeliosStatementPayload;
  serverToken?: string | null;
  usingFixture?: boolean;
  fixtureReason?: string;
};

export default function DashboardClientLoader({
  statementId,
  initialPayload,
  serverToken,
  usingFixture = false,
  fixtureReason,
}: Props) {
  const [payload, setPayload] = useState<HeliosStatementPayload | null>(
    initialPayload ?? null
  );
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(!initialPayload && !usingFixture);

  useEffect(() => {
    if (usingFixture || initialPayload) return;

    const token = serverToken || getStoredToken();
    setLoading(true);
    fetchStatementById(statementId, token)
      .then(setPayload)
      .catch((e) => setError(e instanceof Error ? e.message : "Load failed"))
      .finally(() => setLoading(false));
  }, [statementId, serverToken, usingFixture, initialPayload]);

  if (loading) {
    return (
      <div className="flex items-center justify-center px-4 py-24 text-sm text-slate-500">
        Loading analysis…
      </div>
    );
  }

  if (error || !payload?.data?.statement) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <h1 className="text-xl font-semibold text-slate-900">Could not load statement</h1>
        <p className="mt-2 text-sm text-slate-600">{error ?? "No data returned"}</p>
      </div>
    );
  }

  return (
    <UnderwritingDashboard
      payload={payload}
      statementId={statementId}
      usingFixture={usingFixture}
      fixtureReason={fixtureReason}
    />
  );
}
