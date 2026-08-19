"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useDealContext } from "@/components/shell/DealContext";
import BatchProgressPanel from "@/components/BatchProgressPanel";
import PdfInspector from "@/components/upload/PdfInspector";
import HitlWorkspace from "@/components/upload/HitlWorkspace";
import UploadChatLog, {
  createMessage,
  type ChatMessage,
} from "@/components/upload/UploadChatLog";
import UploadDropZone from "@/components/upload/UploadDropZone";
import UploadPrimaryButton, {
  type PrimaryActionMode,
} from "@/components/upload/UploadPrimaryButton";
import {
  ANALYSIS_SERVER_LOST_MESSAGE,
  confirmBankAndResume,
  extractStatementId,
  fetchProcessingRun,
  fetchTriagePdfFile,
  pollBatchJob,
  redirectToDashboard,
  runBatchAnalysis,
  triageStatements,
  type BankConfirmBatchResult,
  type BatchProgress,
  type HitlBatchResult,
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
  const searchParams = useSearchParams();
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
  const [processingRunId, setProcessingRunId] = useState<string | null>(null);
  const [hitlFileName, setHitlFileName] = useState<string | null>(null);
  const [hitlReviewPayload, setHitlReviewPayload] = useState<Record<
    string,
    unknown
  > | null>(null);
  /** Auto-opens the right-panel HitlWorkspace on REQUIRES_HUMAN_REVIEW. */
  const [hitlWorkspaceOpen, setHitlWorkspaceOpen] = useState(false);
  /** Identity Waterfall Level 4 — confirm detected bank before resume. */
  const [bankConfirm, setBankConfirm] = useState<BankConfirmBatchResult | null>(
    null
  );
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
  const deepLinkHandled = useRef(false);

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

  /** Deep-link: ?processingRunId=&fileName= from Dev Console / bookmarks. */
  useEffect(() => {
    if (deepLinkHandled.current) return;
    const runId = searchParams.get("processingRunId")?.trim();
    if (!runId) return;
    deepLinkHandled.current = true;

    void (async () => {
      try {
        const run = await fetchProcessingRun(runId);
        const failName =
          searchParams.get("fileName")?.trim() ||
          run.failingFileNames?.[0] ||
          null;
        setProcessingRunId(String(run._id || runId));
        setHitlFileName(failName);
        setHitlReviewPayload(
          (run.reviewPayload as Record<string, unknown> | null) ?? null
        );
        if (run.uploadSessionId) setUploadSessionId(run.uploadSessionId);
        setHitlWorkspaceOpen(true);

        if (run.uploadSessionId && failName) {
          try {
            const pdf = await fetchTriagePdfFile(run.uploadSessionId, failName);
            setInspectorFile(pdf);
          } catch {
            append(
              "HITL run loaded — PDF not available from triage session (may have expired).",
              "warning"
            );
          }
        }

        append(
          `Opened HITL run <code>${escapeHtml(String(run._id || runId).slice(0, 12))}…</code>` +
            (failName ? ` — <strong>${escapeHtml(failName)}</strong>` : ""),
          "hitl"
        );
      } catch (e) {
        append(
          escapeHtml(e instanceof Error ? e.message : "Failed to load ProcessingRun"),
          "error"
        );
      }
    })();
  }, [searchParams, append]);

  const openHitlWorkspace = useCallback(
    (opts: {
      processingRunId: string;
      fileName?: string | null;
      reviewPayload?: Record<string, unknown> | null;
      file?: File | null;
    }) => {
      setProcessingRunId(opts.processingRunId);
      setHitlFileName(opts.fileName || null);
      setHitlReviewPayload(opts.reviewPayload ?? null);
      if (opts.file) setInspectorFile(opts.file);
      setHitlWorkspaceOpen(true);
    },
    []
  );

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
      // DropZone passes FileList (array-like); state/render need a real File[].
      const next = list ? Array.from(list) : [];
      // #region agent log
      fetch("http://127.0.0.1:7779/ingest/14ba3817-11f8-4e9c-85f8-0a9bab98d3ad", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Debug-Session-Id": "655110",
        },
        body: JSON.stringify({
          sessionId: "655110",
          runId: "upload-files-fix",
          hypothesisId: "F1",
          location: "UploadHubPage.tsx:onFiles",
          message: "normalized FileList to File[]",
          data: {
            listType: list == null ? "null" : Object.prototype.toString.call(list),
            hasMap: typeof (list as unknown as { map?: unknown })?.map === "function",
            nextIsArray: Array.isArray(next),
            count: next.length,
          },
          timestamp: Date.now(),
        }),
      }).catch(() => {});
      // #endregion
      setFiles(next);
      setUploadSessionId(null);
      setPollingRunId(null);
      setPrimaryMode("upload");
      setProcessingRunId(null);
      setHitlWorkspaceOpen(false);
      setHitlReviewPayload(null);
      setHitlFileName(null);
      setBankConfirm(null);
      if (triageTimer.current) clearTimeout(triageTimer.current);
      if (!next.length) return;
      triageGen.current += 1;
      const gen = triageGen.current;
      triageTimer.current = setTimeout(() => {
        void runTriage(next, gen);
      }, AUTO_TRIAGE_DEBOUNCE_MS);
    },
    [runTriage]
  );

  const handlePrimary = useCallback(async () => {
    const token = getStoredToken();

    if (primaryMode === "upload") {
      if (!files.length) return;
      triageGen.current += 1;
      await runTriage(files, triageGen.current);
      return;
    }

    if (!uploadSessionId) {
      append("Waiting for triage to finish…", "warning");
      return;
    }

    setBusy(true);
    setPrimaryMode("runAnalysis");
    setProgress(null);
    append(`Running macro analysis on <strong>${files.length}</strong> file(s)…`);

    try {
      const { status, json, correlationId } = await runBatchAnalysis(files, {
        uploadSessionId,
        companyName: companyName.trim() || undefined,
        statedRevenue: statedRevenue.trim() || undefined,
        dealId: dealId.trim() || undefined,
      });

      let resultJson:
        | Record<string, unknown>
        | HitlBatchResult
        | BankConfirmBatchResult
        | null = null;

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
        if (json.businessStatus === "REQUIRES_HUMAN_REVIEW") {
          resultJson = {
            hitl: true,
            status: "REQUIRES_HUMAN_REVIEW",
            processingRunId: (json.processingRunId as string) ?? null,
            fileName: (json.fileName as string) ?? null,
            reviewPayload: (json.reviewPayload as Record<string, unknown>) ?? null,
            message: String(
              json.message || "Checksum reconciliation failed — human review required."
            ),
            result: json,
          };
        } else if (
          json.requiresBankConfirmation ||
          json.status === "requires_bank_confirmation"
        ) {
          resultJson = {
            bankConfirm: true,
            status: "requires_bank_confirmation",
            uploadSessionId: (json.uploadSessionId as string) ?? uploadSessionId,
            fileName: (json.fileName as string) ?? null,
            detectedBankName: (json.detectedBankName as string) ?? null,
            bankNameCandidates: (json.bankNameCandidates as string[]) ?? [],
            message: String(json.message || ""),
            previewUrl: (json.previewUrl as string) ?? null,
          };
        } else {
          resultJson = json;
        }
      } else if (status === 422 && json.error === "CHECKSUM_GATE_FAILED") {
        throw new Error(
          String(
            json.message ||
              "Checksum gate failed with no usable transactions — cannot open human review."
          )
        );
      } else {
        throw new Error(String(json.error || json.message || `Batch failed (${status})`));
      }

      if (resultJson && "bankConfirm" in resultJson && resultJson.bankConfirm) {
        const bc = resultJson as BankConfirmBatchResult;
        if (bc.uploadSessionId) setUploadSessionId(bc.uploadSessionId);
        setBankConfirm(bc);
        const bank =
          bc.detectedBankName ||
          bc.bankNameCandidates?.[0] ||
          "Unknown Bank";
        append(
          `Action needed: confirm bank <strong>${escapeHtml(bank)}</strong>` +
            (bc.fileName
              ? ` for <strong>${escapeHtml(bc.fileName)}</strong>`
              : "") +
            `. Analysis paused until you confirm.`,
          "hitl"
        );
        setPrimaryMode("runAnalysis");
        return;
      }

      if (resultJson && "hitl" in resultJson && resultJson.hitl) {
        const hitl = resultJson as HitlBatchResult;
        const failName = hitl.fileName || undefined;
        const failing =
          (failName && files.find((f) => f.name === failName)) || files[0] || null;
        const runId = hitl.processingRunId ? String(hitl.processingRunId) : null;
        if (runId) {
          openHitlWorkspace({
            processingRunId: runId,
            fileName: failName || null,
            reviewPayload:
              (hitl.reviewPayload as Record<string, unknown> | null) ?? null,
            file: failing,
          });
        }
        append(
          `Human review required` +
            (failName ? ` for <strong>${escapeHtml(failName)}</strong>` : "") +
            `. HITL workspace opened — compare the PDF to extracted totals and submit corrections.` +
            (runId
              ? `<br/><span class="opacity-80">Run id: <code>${escapeHtml(runId.slice(0, 12))}…</code></span>`
              : ""),
          "hitl"
        );
        setPrimaryMode("upload");
        return;
      }

      const statementId = extractStatementId(resultJson ?? json);
      if (!statementId) throw new Error("No statement ID returned");

      append(`Analysis complete. Redirecting to dashboard…`, "success");
      redirectToDashboard(statementId, token);
    } catch (e) {
      const raw = e instanceof Error ? e.message : "Analysis failed";
      const isPollConnectionLoss =
        raw === ANALYSIS_SERVER_LOST_MESSAGE ||
        /Job poll failed \(404\)|Job poll failed \(500\)|Failed to fetch|NetworkError|ECONNREFUSED/i.test(
          raw
        );
      append(
        escapeHtml(isPollConnectionLoss ? ANALYSIS_SERVER_LOST_MESSAGE : raw),
        "error"
      );
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
    openHitlWorkspace,
  ]);

  const handleConfirmBank = useCallback(async () => {
    if (!bankConfirm) return;
    const sessionId = bankConfirm.uploadSessionId || uploadSessionId;
    const fileName =
      bankConfirm.fileName || files[0]?.name || null;
    const bankName =
      bankConfirm.detectedBankName ||
      bankConfirm.bankNameCandidates?.[0] ||
      null;
    if (!sessionId || !fileName || !bankName) {
      append("Missing session, file, or bank name for confirmation.", "error");
      return;
    }

    setBusy(true);
    setBankConfirm(null);
    append(
      `Confirming bank <strong>${escapeHtml(bankName)}</strong> and resuming…`,
      "system"
    );

    try {
      const { jobId, correlationId } = await confirmBankAndResume({
        uploadSessionId: sessionId,
        fileName,
        confirmedBankName: bankName,
      });
      append(`Job <code>${String(jobId).slice(0, 8)}…</code> resumed.`, "system");
      const resultJson = await pollBatchJob(String(jobId), {
        correlationId: correlationId || jobId,
        onProgress: (p) => {
          setProgress(p);
          if (p?.message) append(escapeHtml(p.message), "warning");
        },
      });

      if (resultJson && "bankConfirm" in resultJson && resultJson.bankConfirm) {
        setBankConfirm(resultJson as BankConfirmBatchResult);
        append("Bank confirmation still required — check the detected name.", "warning");
        return;
      }

      if (resultJson && "hitl" in resultJson && resultJson.hitl) {
        const hitl = resultJson as HitlBatchResult;
        const failName = hitl.fileName || undefined;
        const failing =
          (failName && files.find((f) => f.name === failName)) || files[0] || null;
        const runId = hitl.processingRunId ? String(hitl.processingRunId) : null;
        if (runId) {
          openHitlWorkspace({
            processingRunId: runId,
            fileName: failName || null,
            reviewPayload:
              (hitl.reviewPayload as Record<string, unknown> | null) ?? null,
            file: failing,
          });
        }
        append(
          `Human review required` +
            (failName ? ` for <strong>${escapeHtml(failName)}</strong>` : "") +
            `. HITL workspace opened.`,
          "hitl"
        );
        return;
      }

      const token = getStoredToken();
      const statementId = extractStatementId(resultJson);
      if (!statementId) throw new Error("No statement ID returned after bank confirm");
      append(`Analysis complete. Redirecting to dashboard…`, "success");
      redirectToDashboard(statementId, token);
    } catch (e) {
      append(
        escapeHtml(e instanceof Error ? e.message : "Bank confirm failed"),
        "error"
      );
    } finally {
      setBusy(false);
    }
  }, [
    bankConfirm,
    uploadSessionId,
    files,
    append,
    openHitlWorkspace,
  ]);

  const phase =
    busy && primaryMode === "upload"
      ? "triage"
      : busy && primaryMode === "runAnalysis"
        ? "analyze"
        : "idle";

  const showHitlAside = Boolean(hitlWorkspaceOpen && processingRunId);

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
          {processingRunId && (
            <p className="mt-1 font-mono text-xs text-violet-700">
              HITL run: {processingRunId}
              {!hitlWorkspaceOpen && (
                <button
                  type="button"
                  className="ml-2 text-violet-800 underline"
                  onClick={() => setHitlWorkspaceOpen(true)}
                >
                  Open workspace
                </button>
              )}
            </p>
          )}
        </header>

        <BatchProgressPanel phase={phase} progress={progress} busy={busy} />

        {busy && (
          <div className="hub-progress">
            <div className="hub-progress__bar w-full" />
          </div>
        )}

        <UploadChatLog messages={messages} />

        {bankConfirm && (
          <div className="rounded-xl border border-amber-200 bg-amber-50/80 p-4">
            <p className="text-sm font-semibold text-amber-950">
              Confirm bank to continue
            </p>
            <p className="mt-1 text-sm text-amber-900">
              Detected:{" "}
              <strong>
                {bankConfirm.detectedBankName ||
                  bankConfirm.bankNameCandidates?.[0] ||
                  "Unknown Bank"}
              </strong>
              {bankConfirm.fileName ? (
                <>
                  {" "}
                  · file <span className="font-mono text-xs">{bankConfirm.fileName}</span>
                </>
              ) : null}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                className="helios-btn helios-btn-primary"
                disabled={busy}
                onClick={() => void handleConfirmBank()}
              >
                Yes, Confirm Bank
              </button>
              <button
                type="button"
                className="helios-btn helios-btn-secondary"
                disabled={busy}
                onClick={() => {
                  setBankConfirm(null);
                  append("Bank confirmation skipped. Re-upload or re-run triage.", "warning");
                }}
              >
                Skip
              </button>
              {files[0] && (
                <button
                  type="button"
                  className="helios-btn helios-btn-secondary"
                  disabled={busy}
                  onClick={() => {
                    const name = bankConfirm.fileName;
                    const f =
                      (name && files.find((x) => x.name === name)) || files[0];
                    if (f) setInspectorFile(f);
                  }}
                >
                  View Document
                </button>
              )}
            </div>
          </div>
        )}

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
      <aside
        className={`shrink-0 border-l border-[var(--helios-border)] bg-white ${
          showHitlAside
            ? "fixed inset-y-0 right-0 z-40 w-[min(100vw,440px)] shadow-xl xl:static xl:z-auto xl:w-[440px] xl:shadow-none"
            : "hidden w-[360px] xl:block"
        }`}
      >
        {showHitlAside && processingRunId ? (
          <HitlWorkspace
            processingRunId={processingRunId}
            fileName={hitlFileName}
            reviewPayload={hitlReviewPayload}
            file={inspectorFile}
            onClose={() => setHitlWorkspaceOpen(false)}
            onResolved={(result) => {
              append(
                `HITL resolved` +
                  (result.profileStatus
                    ? ` — profile <strong>${escapeHtml(String(result.profileStatus))}</strong>`
                    : "") +
                  (result.statementId
                    ? `. Redirecting…`
                    : `. No statement id — template may still be verified.`),
                "success"
              );
              setProcessingRunId(null);
              setHitlWorkspaceOpen(false);
              setHitlReviewPayload(null);
              setHitlFileName(null);
            }}
            onError={(msg) => append(escapeHtml(msg), "error")}
          />
        ) : (
          <PdfInspector file={inspectorFile} onClose={() => setInspectorFile(null)} />
        )}
      </aside>
    </div>
  );
}
