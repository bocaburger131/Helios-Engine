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
  pollBatchJob,
  redirectToDashboard,
  runBatchAnalysis,
  triageStatements,
  type BatchProgress,
} from "@/lib/batchUploadClient";
import { fetchDevConfig, getStoredToken } from "@/lib/apiClient";
import {
  useStatementPolling,
  type PollingStatus,
} from "@/hooks/useStatementPolling";

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
  const [pollingRunId, setPollingRunId] = useState<string | null>(null);

  const { status: pollStatus, reviewPayload: pollPayload } =
    useStatementPolling(pollingRunId);

  useEffect(() => {
    if (pollStatus === "REQUIRES_HUMAN_REVIEW" && pollPayload) {
      setMessages((prev) => [
        ...prev,
        createMessage(
          `Human review required — checksum delta <strong>${pollPayload.checksumDelta}</strong>. Review the extracted rows below.`,
          "hitl",
          { ...pollPayload, runId: pollingRunId ?? undefined }
        ),
      ]);
      if (files.length > 0) {
        setInspectorFile(files[0]);
      }
      setPollingRunId(null);
    } else if (
      pollStatus === "COMPLETED" ||
      pollStatus === "FAILED"
    ) {
      setPollingRunId(null);
    }
  }, [pollStatus, pollPayload, files, pollingRunId]);

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
      setPollingRunId(null);
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
      });

      let resultJson: Record<string, unknown> | null = null;

      if (status === 202 && json.jobId) {
        const jobId = String(json.jobId);
        append(`Job <code>${jobId.slice(0, 8)}…</code> running.`, "system");
        setPollingRunId(jobId);
        resultJson = await pollBatchJob(jobId, {
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
        throw new Error(String(json.error || json.message || `Batch failed (${status})`));
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
