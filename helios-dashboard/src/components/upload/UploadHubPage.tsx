"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useDealContext } from "@/components/shell/DealContext";
import BatchProgressPanel from "@/components/BatchProgressPanel";
import PdfInspector from "@/components/upload/PdfInspector";
import UploadChatLog, {
  createMessage,
  type ChatMessage,
} from "@/components/upload/UploadChatLog";
import UploadDropZone from "@/components/upload/UploadDropZone";
import UploadPrimaryButton, {
  type PrimaryActionMode,
} from "@/components/upload/UploadPrimaryButton";
import {
  extractStatementId,
  formatBatchError,
  pollBatchJob,
  redirectToDashboard,
  runBatchAnalysis,
  triageStatements,
  type BatchProgress,
  type TriageResult,
} from "@/lib/batchUploadClient";
import { fetchDevConfig, getStoredToken } from "@/lib/apiClient";

const AUTO_TRIAGE_DEBOUNCE_MS = 300;

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export default function UploadHubPage() {
  const { dealId, companyName, statedRevenue, setCompanyName, setStatedRevenue } =
    useDealContext();

  const [files, setFiles] = useState<File[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [uploadSessionId, setUploadSessionId] = useState<string | null>(null);
  const [primaryMode, setPrimaryMode] = useState<PrimaryActionMode>("upload");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<BatchProgress | null>(null);
  const [inspectorFile, setInspectorFile] = useState<File | null>(null);
  const [serverConfig, setServerConfig] = useState("");
  const [institutionGate, setInstitutionGate] = useState<
    TriageResult["institutionProfileGate"] | null
  >(null);

  const triageTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const triageGen = useRef(0);

  const append = useCallback((html: string, variant: ChatMessage["variant"] = "system") => {
    setMessages((prev) => [...prev, createMessage(html, variant)]);
  }, []);

  useEffect(() => {
    fetchDevConfig()
      .then((c) =>
        setServerConfig(
          `shadow=${c.layoutFirstShadow} · primary=${c.layoutFirstPrimary} · port=${c.apiPort}`
        )
      )
      .catch(() => {});
  }, []);

  const runTriage = useCallback(
    async (fileList: File[], generation: number) => {
      if (!fileList.length) return;
      setBusy(true);
      append(`Classifying <strong>${fileList.length}</strong> file(s)…`);
      try {
        const result = await triageStatements(fileList, {
          companyName: companyName.trim() || undefined,
          statedRevenue: statedRevenue.trim() || undefined,
          dealId: dealId.trim() || undefined,
        });
        if (generation !== triageGen.current) return;
        if (!result.uploadSessionId) throw new Error("No session id returned");

        setUploadSessionId(result.uploadSessionId);
        setPrimaryMode("runAnalysis");
        setInstitutionGate(result.institutionProfileGate ?? null);

        const names =
          result.triage?.statements?.map((s) => s.name).filter(Boolean) ?? [];
        append(
          `Triage complete — <strong>${names.length || fileList.length}</strong> statement(s) ready.` +
            (names.length ? `<br/>${names.map((n) => escapeHtml(n ?? "")).join(", ")}` : ""),
          "success"
        );

        if (result.extractedAnchorData?.companyName && !companyName.trim()) {
          setCompanyName(result.extractedAnchorData.companyName);
          append(
            `Detected company: <strong>${escapeHtml(result.extractedAnchorData.companyName)}</strong>`,
            "deal"
          );
        }
        if (result.extractedAnchorData?.statedRevenue && !statedRevenue.trim()) {
          setStatedRevenue(String(result.extractedAnchorData.statedRevenue));
        }

        if (result.institutionProfileGate) {
          const g = result.institutionProfileGate;
          const bank = g.bankName || "Institution";
          const status = g.profileStatus || "UNKNOWN";
          const layoutStatus = g.layoutDiscoveryStatus || "unknown";
          append(
            `<strong>Step 1 — ${escapeHtml(bank)}</strong><br/>` +
              `Profile: <code>${escapeHtml(g.codeProfileId || "unknown")}</code> · ` +
              `Status: <strong>${escapeHtml(status)}</strong> · ` +
              `Layout discovery: <strong>${escapeHtml(layoutStatus)}</strong>` +
              (g.step1Required
                ? `<br/><span class="text-amber-700">Layout mapping or institution profile incomplete before production underwriting.</span>`
                : `<br/><span class="text-emerald-700">Institution profile ready for production analysis.</span>`),
            g.step1Required ? "warning" : "success"
          );
        }

        append("Click <strong>Run Analysis</strong> when ready.", "system");
      } catch (e) {
        if (generation !== triageGen.current) return;
        append(
          escapeHtml(e instanceof Error ? e.message : "Triage failed"),
          "error"
        );
        setPrimaryMode("upload");
      } finally {
        if (generation === triageGen.current) setBusy(false);
      }
    },
    [append, companyName, statedRevenue, dealId, setCompanyName, setStatedRevenue]
  );

  const onFiles = useCallback(
    (list: FileList | null) => {
      if (!list?.length) return;
      const pdfs = Array.from(list).filter(
        (f) => f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf")
      );
      if (!pdfs.length) {
        append("Please select PDF files only.", "error");
        return;
      }
      setFiles(pdfs);
      setUploadSessionId(null);
      setPrimaryMode("upload");
      append(`Staged ${pdfs.length} PDF(s). Auto-triage starting…`, "system");

      if (triageTimer.current) clearTimeout(triageTimer.current);
      triageGen.current += 1;
      const gen = triageGen.current;
      triageTimer.current = setTimeout(() => {
        runTriage(pdfs, gen);
      }, AUTO_TRIAGE_DEBOUNCE_MS);
    },
    [append, runTriage]
  );

  const handlePrimary = useCallback(async () => {
    if (primaryMode === "upload") {
      if (!files.length) {
        append("Add at least one PDF first.", "error");
        return;
      }
      triageGen.current += 1;
      await runTriage(files, triageGen.current);
      return;
    }

    if (!uploadSessionId) {
      append("Complete triage first.", "error");
      return;
    }

    const token = getStoredToken();
    setBusy(true);
    setProgress(null);
    append("Macro analysis queued…", "system");

    try {
      const { status, json, correlationId } = await runBatchAnalysis(files, {
        uploadSessionId,
        companyName: companyName.trim() || undefined,
        statedRevenue: statedRevenue.trim() || undefined,
        dealId: dealId.trim() || undefined,
        allowProbeAnalysis: true,
      });

      let resultJson: Record<string, unknown> | null = null;

      if (status === 202 && json.jobId) {
        append(`Job <code>${String(json.jobId).slice(0, 8)}…</code> running.`, "system");
        resultJson = await pollBatchJob(String(json.jobId), {
          correlationId,
          onProgress: (p) => {
            setProgress(p);
            if (p?.message) {
              append(escapeHtml(p.message), "warning");
            }
          },
        });
      } else if (status === 201) {
        resultJson = json;
      } else {
        throw new Error(formatBatchError(json, status));
      }

      const statementId = extractStatementId(resultJson ?? json);
      if (!statementId) throw new Error("No statement ID returned");

      append(`Analysis complete. Redirecting to dashboard…`, "success");
      redirectToDashboard(statementId, token);
    } catch (e) {
      append(escapeHtml(e instanceof Error ? e.message : "Analysis failed"), "error");
    } finally {
      setBusy(false);
    }
  }, [
    primaryMode,
    files,
    uploadSessionId,
    companyName,
    statedRevenue,
    dealId,
    append,
    runTriage,
  ]);

  const phase =
    busy && primaryMode === "upload"
      ? "triage"
      : busy && primaryMode === "runAnalysis"
        ? "analyze"
        : "idle";

  return (
    <div className="flex min-h-full">
      <div className="mx-auto min-w-0 flex-1 max-w-4xl space-y-6 px-4 py-8 sm:px-8">
        <header>
          <h1 className="text-2xl font-semibold text-slate-900">Upload Hub</h1>
          <p className="mt-1 text-sm text-slate-600">
            Drop statements · auto-triage · run macro analysis · underwriting dashboard
          </p>
          {serverConfig && (
            <p className="mt-1 font-mono text-xs text-slate-400">{serverConfig}</p>
          )}
        </header>

        <BatchProgressPanel phase={phase} progress={progress} busy={busy} />

        {institutionGate?.layoutDiscoveryStatus &&
          institutionGate.layoutDiscoveryStatus !== "complete" && (
          <div
            className="rounded-lg border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900"
            role="status"
          >
            <p className="font-semibold">
              Layout discovery: {institutionGate.layoutDiscoveryStatus}
            </p>
            <p className="mt-1 text-sky-800">
              Every statement is mapped on parse; partial or failed maps may limit provenance
              and checksum quality until templates graduate.
            </p>
          </div>
        )}

        {institutionGate?.step1Required && (
          <div
            className="rounded-lg border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900"
            role="status"
          >
            <p className="font-semibold">
              Layout learning active — {institutionGate.bankName || "Institution"} (
              {institutionGate.profileStatus || "LEARNING"})
            </p>
            <p className="mt-1 text-sky-800">
              {institutionGate.recommendation ||
                "Checksums improve as templates graduate to VERIFIED. Macro analysis runs while learning is in progress."}
            </p>
          </div>
        )}

        {busy && (
          <div className="hub-progress">
            <div className="hub-progress__bar w-full" />
          </div>
        )}

        <UploadChatLog messages={messages} />

        <UploadDropZone
          files={files}
          busy={busy}
          onFiles={onFiles}
          onPreview={setInspectorFile}
        />

        <div className="flex flex-wrap items-center gap-4">
          <UploadPrimaryButton
            mode={primaryMode}
            busy={busy}
            disabled={!files.length}
            onClick={handlePrimary}
          />
          {uploadSessionId && (
            <span className="font-mono text-xs text-slate-400">
              Session: {uploadSessionId.slice(0, 12)}…
            </span>
          )}
        </div>
      </div>
      <aside className="hidden w-[360px] shrink-0 border-l border-[var(--helios-border)] bg-white xl:block">
        <PdfInspector file={inspectorFile} onClose={() => setInspectorFile(null)} />
      </aside>
    </div>
  );
}
