"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import DocumentProvenance from "@/components/provenance/DocumentProvenance";
import AiTelemetryTimeline from "@/components/results/AiTelemetryTimeline";
import AnalysisTimestampBar from "@/components/results/AnalysisTimestampBar";
import DashboardFooterControls from "@/components/results/DashboardFooterControls";
import HeroGrid from "@/components/results/HeroGrid";
import IdentityBadge from "@/components/results/IdentityBadge";
import JsonInspectorModal from "@/components/results/JsonInspectorModal";
import ProjectionsPanel from "@/components/results/ProjectionsPanel";
import VeraDock from "@/components/results/VeraDock";
import VeraFixModal from "@/components/results/VeraFixModal";
import VeritasScoreCard from "@/components/results/VeritasScoreCard";
import WidgetRegistryDrawer from "@/components/results/WidgetRegistryDrawer";
import UnderwritingWorkspaceGrid, {
  type WorkspaceGridApi,
} from "@/components/widgets/UnderwritingWorkspaceGrid";
import { useVeraOptional } from "@/components/vera/VeraProvider";
import { PipelineShadowPanel } from "@/components/ParseTestPanels";
import {
  formatCurrency,
  getChecksumFailures,
  getLayoutShadowEntries,
  type HeliosStatementPayload,
} from "@/lib/analysisAdapter";
import { buildEnvelopeViewModel } from "@/lib/envelopeAdapter";
import { parseTelemetryTimeline } from "@/lib/parseTelemetryTimeline";
import type { PresetId, WidgetId } from "@/lib/workspaceLayout";

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
  const telemetryEvents = useMemo(
    () => parseTelemetryTimeline(payload),
    [payload]
  );
  const summaries = payload.data?.statement?.monthlyStatementSummaries ?? [];
  const veraAnalysis = payload.data?.statement?.analysis?.vera;
  const identityCrossCheck = veraAnalysis?.identityCrossCheck ?? null;
  const deltaFixes = veraAnalysis?.deltaFixes ?? [];
  const pdfUrl =
    (payload.data as { vera?: { pdfUrl?: string } })?.vera?.pdfUrl ?? null;

  const [jsonOpen, setJsonOpen] = useState(false);
  const [auditOpen, setAuditOpen] = useState(false);
  const [veraFixOpen, setVeraFixOpen] = useState(false);
  const [registryOpen, setRegistryOpen] = useState(false);
  const [heatmapCategory, setHeatmapCategory] = useState<string | null>(null);
  const [layoutSavedFlash, setLayoutSavedFlash] = useState(false);
  const [layoutEditMode, setLayoutEditMode] = useState(false);
  const [visible, setVisible] = useState<Partial<Record<WidgetId, boolean>>>({});
  const workspaceApi = useRef<WorkspaceGridApi | null>(null);
  const veraChat = useVeraOptional();
  const setVeraDealContext = veraChat?.setDealContext;

  useEffect(() => {
    if (!setVeraDealContext) return;
    const totals = payload.data?.statement?.analysis?.financialTotals;
    const deposits = totals?.totalDeposits ?? null;
    const withdrawals = totals?.totalWithdrawals ?? null;
    const netCashFlow =
      deposits != null && withdrawals != null
        ? Number(deposits) - Number(withdrawals)
        : null;
    setVeraDealContext({
      statementId,
      companyName: view.companyName,
      bankName: view.bankName,
      accountNumber: view.accountNumber,
      dealId: view.dealId,
      veraDecision: view.veraDecision,
      veraScore: view.veraScore,
      veritasScore: view.veritasScore,
      veritasBadge: view.veritasBadge,
      bankabilityLabel: view.bankabilityLabel,
      metrics: view.metrics,
      netCashFlow,
      totalDeposits: deposits,
      totalWithdrawals: withdrawals,
      veraBriefing: view.veraBriefing,
      coverageMonths: view.coverageMonths,
      checksumOk: checksumFailures.length === 0,
      checksumFailedFiles: checksumFailures.map((r) => r.fileName).filter(Boolean),
      mode: "results_only",
    });
  }, [
    setVeraDealContext,
    statementId,
    view.companyName,
    view.bankName,
    view.accountNumber,
    view.dealId,
    view.veraDecision,
    view.veraScore,
    view.veritasScore,
    view.veritasBadge,
    view.bankabilityLabel,
    view.metrics,
    view.veraBriefing,
    view.coverageMonths,
    payload.data?.statement?.analysis?.financialTotals,
    checksumFailures,
  ]);

  const openJson = () => {
    setAuditOpen(false);
    setJsonOpen(true);
  };
  const openAuditTrail = () => {
    setJsonOpen(false);
    setAuditOpen(true);
  };

  const flashSaved = () => {
    setLayoutSavedFlash(true);
    window.setTimeout(() => setLayoutSavedFlash(false), 1500);
  };

  const onToggleVisible = (id: WidgetId, next: boolean) => {
    workspaceApi.current?.setWidgetVisible(id, next);
    setVisible((prev) => ({ ...prev, [id]: next }));
  };

  return (
    <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-6 px-4 py-8 pb-28 sm:px-6 dark:text-slate-100">
      {usingFixture && (
        <div
          role="status"
          className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100"
        >
          <p className="font-medium">Fixture mode</p>
          <p className="mt-1 text-amber-900/90 dark:text-amber-200/90">
            {fixtureReason ||
              "Showing mock data. Remove ?fixture=1 or start the API for live data."}
          </p>
        </div>
      )}

      {checksumFailures.length > 0 && (
        <div
          role="alert"
          className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-950 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-100"
        >
          <p className="font-medium">Checksum verification failed</p>
          <p className="mt-1 text-rose-900/90 dark:text-rose-200/90">
            {checksumFailures.length} statement
            {checksumFailures.length === 1 ? "" : "s"} did not pass reconciliation.
            Chart totals may be unreliable until parsing is fixed.
          </p>
          <ul className="mt-2 list-inside list-disc text-rose-900/80 dark:text-rose-200/80">
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

      <AnalysisTimestampBar
        payload={payload}
        statementId={statementId}
        onViewJson={openJson}
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
        <HeroGrid view={view} statementId={statementId} />
        <div className="space-y-4">
          <VeritasScoreCard view={view} />
          <IdentityBadge crossCheck={identityCrossCheck} />
        </div>
      </div>

      <UnderwritingWorkspaceGrid
        payload={payload}
        view={view}
        telemetryEvents={telemetryEvents}
        apiRef={workspaceApi}
        onSaved={flashSaved}
        layoutEditMode={layoutEditMode}
        visible={visible}
        onVisibleChange={setVisible}
        onCategoryClick={setHeatmapCategory}
      />

      <ProjectionsPanel payload={payload} />

      <DocumentProvenance
        payload={payload}
        pdfUrl={pdfUrl}
        highlightCategory={heatmapCategory}
      />

      {summaries.length > 0 && (
        <section className="helios-card overflow-hidden dark:border-slate-800 dark:bg-slate-900">
          <h2 className="border-b border-[var(--helios-border)] px-4 py-3 text-sm font-semibold text-slate-800 sm:px-6 dark:border-slate-800 dark:text-slate-100">
            Per-statement parse quality
          </h2>
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500 dark:bg-slate-950 dark:text-slate-400">
                <tr>
                  <th className="px-4 py-3 sm:px-6">File</th>
                  <th className="px-4 py-3">Deposits</th>
                  <th className="px-4 py-3">Withdrawals</th>
                  <th className="px-4 py-3">Quality</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {summaries.map((row) => (
                  <tr key={row.fileName}>
                    <td className="px-4 py-3 font-medium text-slate-800 sm:px-6 dark:text-slate-100">
                      {row.fileName}
                    </td>
                    <td className="px-4 py-3 text-green-700 dark:text-green-400">
                      {formatCurrency(row.totalDeposits)}
                    </td>
                    <td className="px-4 py-3 text-red-700 dark:text-red-400">
                      {formatCurrency(row.totalWithdrawals)}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                          row.checksumOk
                            ? "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200"
                            : "bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-100"
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
        <section className="helios-card overflow-hidden dark:border-slate-800 dark:bg-slate-900">
          <h2 className="border-b border-[var(--helios-border)] px-4 py-3 text-sm font-semibold text-slate-800 sm:px-6 dark:border-slate-800 dark:text-slate-100">
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

      <DashboardFooterControls
        layoutEditMode={layoutEditMode}
        onToggleLayoutEditMode={() => setLayoutEditMode((v) => !v)}
        onOpenRegistry={() => setRegistryOpen(true)}
        onSaveLayout={() => {
          workspaceApi.current?.saveNow();
          flashSaved();
        }}
        onResetLayout={() => {
          workspaceApi.current?.reset();
          setVisible({});
        }}
        onApplyPreset={(id: PresetId) => workspaceApi.current?.applyPreset(id)}
        onViewAuditTrail={openAuditTrail}
        layoutSavedFlash={layoutSavedFlash}
      />

      <WidgetRegistryDrawer
        open={registryOpen}
        onClose={() => setRegistryOpen(false)}
        visible={visible}
        onToggle={onToggleVisible}
      />

      <JsonInspectorModal
        open={jsonOpen}
        onClose={() => setJsonOpen(false)}
        data={payload}
        title={`Statement ${statementId}`}
      />

      <AiTelemetryTimeline
        open={auditOpen}
        onClose={() => setAuditOpen(false)}
        events={telemetryEvents}
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
