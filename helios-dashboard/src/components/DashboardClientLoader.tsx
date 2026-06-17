"use client";

import { useEffect, useState } from "react";
import UnderwritingDashboard from "@/components/UnderwritingDashboard";
import { useDealContextOptional } from "@/components/shell/DealContext";
import { fetchStatementById, getStoredToken } from "@/lib/apiClient";
import type { HeliosStatementPayload } from "@/lib/analysisAdapter";

type Props = {
  statementId: string;
  initialPayload?: HeliosStatementPayload;
  serverToken?: string | null;
  serverFetchError?: string | null;
  usingFixture?: boolean;
  fixtureReason?: string;
};

export default function DashboardClientLoader({
  statementId,
  initialPayload,
  serverToken,
  serverFetchError,
  usingFixture = false,
  fixtureReason,
}: Props) {
  const [payload, setPayload] = useState<HeliosStatementPayload | null>(
    initialPayload ?? null
  );
  const [error, setError] = useState<string | null>(serverFetchError ?? null);
  const [loading, setLoading] = useState(!initialPayload && !usingFixture);

  const dealContext = useDealContextOptional();

  useEffect(() => {
    if (usingFixture || initialPayload) return;

    const token = serverToken || getStoredToken();
    setLoading(true);
    fetchStatementById(statementId, token)
      .then((p) => {
        setPayload(p);
        setError(null);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Load failed"))
      .finally(() => setLoading(false));
  }, [statementId, serverToken, usingFixture, initialPayload]);

  useEffect(() => {
    const ctx = payload?.data?.statement?.applicationContext;
    if (!ctx || !dealContext) return;
    dealContext.hydrateFromApplicationContext({
      dealId: ctx.dealId,
      companyName: ctx.companyName,
      statedRevenue: ctx.statedRevenue ?? ctx.annualRevenue,
      statedGAR: (ctx as { statedGAR?: number }).statedGAR,
      annualRevenue: ctx.annualRevenue,
      requestedLoanAmount: ctx.requestedLoanAmount,
    });
  }, [payload, dealContext]);

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
