"use client";

import { useMemo, useState } from "react";
import ForensicChart from "@/components/charts/ForensicChart";
import RiskHeatmap from "@/components/charts/RiskHeatmap";
import DocumentProvenance from "@/components/provenance/DocumentProvenance";
import HeroGrid from "@/components/results/HeroGrid";
import IdentityBadge from "@/components/results/IdentityBadge";
import JsonInspectorModal from "@/components/results/JsonInspectorModal";
import MetricsRow from "@/components/results/MetricsRow";
import ProjectionsPanel from "@/components/results/ProjectionsPanel";
import ResultsToolbar from "@/components/results/ResultsToolbar";
import VeraBriefingPanel from "@/components/results/VeraBriefingPanel";
import VeraDock from "@/components/results/VeraDock";
import VeraFixModal from "@/components/results/VeraFixModal";
import VeritasScoreCard from "@/components/results/VeritasScoreCard";
import { PipelineShadowPanel } from "@/components/ParseTestPanels";
import {
  formatCurrency,
  getChecksumFailures,
  getLayoutShadowEntries,
  type HeliosStatementPayload,
} from "@/lib/analysisAdapter";
import { buildEnvelopeViewModel } from "@/lib/envelopeAdapter";

type Props = {
  payload: HeliosStatementPayload;
  statementId: string;
  usingFixture?: boolean;
  fixtureReason?: string;
};

export default function UnderwritingDashboard({
  payload,
  statementId,
  usingFixture = false,
  fixtureReason,
}: Props) {
  const view = useMemo(() => buildEnvelopeViewModel(payload), [payload]);
  const checksumFailures = useMemo(() => getChecksumFailures(payload), [payload]);
  const shadowEntries = useMemo(() => getLayoutShadowEntries(payload), [payload]);
  const summaries = payload.data?.statement?.monthlyStatementSummaries ?? [];
  const vera = payload.data?.statement?.analysis?.vera;
  const identityCrossCheck = vera?.identityCrossCheck ?? null;
  const deltaFixes = vera?.deltaFixes ?? [];
  const pdfUrl =
    (payload.data as { vera?: { pdfUrl?: string } })?.vera?.pdfUrl ?? null;

  const [jsonOpen, setJsonOpen] = useState(false);
  const [veraFixOpen, setVeraFixOpen] = useState(false);
  const [heatmapCategory, setHeatmapCategory] = useState<string | null>(null);

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8 sm:px-6">
      {usingFixture && (
        <div
          role="status"
          className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950"
        >
          <p className="font-medium">Fixture mode</p>
          <p className="mt-1 text-amber-900/90">
            {fixtureReason ||
              "Showing mock data. Remove ?fixture=1 or start the API for live data."}
          </p>
        </div>
      )}

      {checksumFailures.length > 0 && (
        <div
          role="alert"
          className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-950"
        >
          <p className="font-medium">Checksum verification failed</p>
          <p className="mt-1 text-rose-900/90">
            {checksumFailures.length} statement
            {checksumFailures.length === 1 ? "" : "s"} did not pass reconciliation.
            Chart totals may be unreliable until parsing is fixed.
          </p>
          <ul className="mt-2 list-inside list-disc text-rose-900/80">
            {checksumFailures.map((row) => (
              <li key={row.fileName}>
                {row.fileName}
                {row.parseQuality ? ` (${row.parseQuality})` : ""}
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={() => setVeraFixOpen(true)}
            className="helios-btn helios-btn-primary mt-4 py-1.5 text-xs"
          >
            Review with Vera
          </button>
        </div>
      )}

      <ResultsToolbar
        statementId={statementId}
        onViewJson={() => setJsonOpen(true)}
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
        <HeroGrid view={view} statementId={statementId} />
        <div className="space-y-4">
          <VeritasScoreCard view={view} />
          <IdentityBadge crossCheck={identityCrossCheck} />
        </div>
      </div>

      <MetricsRow view={view} />

      <div className="grid gap-6 xl:grid-cols-2">
        <ForensicChart payload={payload} defaultHorizon="l3m" />
        <RiskHeatmap payload={payload} onCategoryClick={setHeatmapCategory} />
      </div>

      <ProjectionsPanel payload={payload} />

      <DocumentProvenance
        payload={payload}
        pdfUrl={pdfUrl}
        highlightCategory={heatmapCategory}
      />

      <VeraBriefingPanel markdown={view.veraBriefing} />

      {summaries.length > 0 && (
        <section className="helios-card overflow-hidden">
          <h2 className="border-b border-[var(--helios-border)] px-4 py-3 text-sm font-semibold text-slate-800 sm:px-6">
            Per-statement parse quality
          </h2>
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-3 sm:px-6">File</th>
                  <th className="px-4 py-3">Deposits</th>
                  <th className="px-4 py-3">Withdrawals</th>
                  <th className="px-4 py-3">Quality</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {summaries.map((row) => (
                  <tr key={row.fileName}>
                    <td className="px-4 py-3 font-medium text-slate-800 sm:px-6">
                      {row.fileName}
                    </td>
                    <td className="px-4 py-3 text-green-700">
                      {formatCurrency(row.totalDeposits)}
                    </td>
                    <td className="px-4 py-3 text-red-700">
                      {formatCurrency(row.totalWithdrawals)}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                          row.checksumOk
                            ? "bg-green-100 text-green-800"
                            : "bg-amber-100 text-amber-900"
                        }`}
                      >
                        {row.parseQuality || (row.checksumOk ? "OK" : "Review")}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {shadowEntries.length > 0 && (
        <section className="helios-card overflow-hidden">
          <h2 className="border-b border-[var(--helios-border)] px-4 py-3 text-sm font-semibold text-slate-800 sm:px-6">
            Layout-first shadow comparison
          </h2>
          <div className="space-y-6 px-4 py-4 sm:px-6">
            {shadowEntries.map(({ fileName, shadow }) => (
              <div key={fileName}>
                {shadowEntries.length > 1 && (
                  <p className="mb-2 text-xs font-medium uppercase text-slate-500">
                    {fileName}
                  </p>
                )}
                <PipelineShadowPanel shadow={shadow} />
              </div>
            ))}
          </div>
        </section>
      )}

      <VeraDock decision={view.veraDecision} score={view.veraScore} />

      <JsonInspectorModal
        open={jsonOpen}
        onClose={() => setJsonOpen(false)}
        data={payload}
        title={`Statement ${statementId}`}
      />

      <VeraFixModal
        open={veraFixOpen}
        onClose={() => setVeraFixOpen(false)}
        statementId={statementId}
        deltaFixes={deltaFixes}
      />
    </div>
  );
}
