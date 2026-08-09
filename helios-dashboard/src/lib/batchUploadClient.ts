import {
  API_BASE,
  authHeaders,
  getDashboardUrl,
  getStoredToken,
} from "@/lib/apiClient";

export type TriageResult = {
  success?: boolean;
  uploadSessionId?: string;
  triage?: {
    statements?: Array<{ name?: string }>;
    applications?: Array<{ name?: string }>;
    skipped?: Array<{ name?: string; reason?: string }>;
  };
  extractedAnchorData?: {
    companyName?: string;
    requestedLoanAmount?: number;
    statedRevenue?: number;
    annualRevenue?: number;
  };
  error?: string;
  message?: string;
};

export type BatchProgress = {
  phase?: string;
  message?: string;
  fileName?: string;
  rtn?: string;
};

export type BatchJobStatus = {
  status?: string;
  error?: string;
  correlationId?: string;
  jobId?: string;
  result?: Record<string, unknown>;
  diagnosticSummaries?: unknown[];
  requiresBankConfirmation?: boolean;
  uploadSessionId?: string;
  fileName?: string;
  detectedBankName?: string;
  bankNameCandidates?: string[];
  previewUrl?: string;
  message?: string;
  processingRunId?: string;
  reviewPayload?: Record<string, unknown> | null;
};

export type HitlBatchResult = {
  hitl: true;
  status: "REQUIRES_HUMAN_REVIEW";
  processingRunId?: string | null;
  fileName?: string | null;
  reviewPayload?: Record<string, unknown> | null;
  message?: string;
  result?: Record<string, unknown> | null;
};

/** Identity Waterfall Level 4 — human must confirm detected bank before resume. */
export type BankConfirmBatchResult = {
  bankConfirm: true;
  status: "requires_bank_confirmation";
  uploadSessionId?: string | null;
  fileName?: string | null;
  detectedBankName?: string | null;
  bankNameCandidates?: string[];
  message?: string;
  previewUrl?: string | null;
};

export type UploadContext = {
  companyName?: string;
  statedRevenue?: string;
  dealId?: string;
  usePublicUpload?: boolean;
};

const USE_PUBLIC =
  process.env.NEXT_PUBLIC_USE_PUBLIC_UPLOAD === "true";

function triagePath(publicUpload?: boolean) {
  const pub = publicUpload ?? USE_PUBLIC;
  return pub ? "/api/statements/batch/triage/public" : "/api/statements/batch/triage";
}

function batchPath(publicUpload?: boolean) {
  const pub = publicUpload ?? USE_PUBLIC;
  return pub ? "/api/statements/batch/public" : "/api/statements/batch";
}

function progressPath(correlationId: string, publicUpload?: boolean) {
  const pub = publicUpload ?? USE_PUBLIC;
  const base = pub
    ? `/api/statements/batch/progress/${encodeURIComponent(correlationId)}/public`
    : `/api/statements/batch/progress/${encodeURIComponent(correlationId)}`;
  return base;
}

function jobPath(jobId: string, publicUpload?: boolean) {
  const pub = publicUpload ?? USE_PUBLIC;
  return pub
    ? `/api/statements/batch/jobs/${encodeURIComponent(jobId)}/public`
    : `/api/statements/batch/jobs/${encodeURIComponent(jobId)}`;
}

function confirmBankPath(publicUpload?: boolean) {
  const pub = publicUpload ?? USE_PUBLIC;
  return pub
    ? "/api/statements/batch/confirm-bank/public"
    : "/api/statements/batch/confirm-bank";
}

export function buildBatchFormData(
  files: File[],
  ctx: UploadContext & { uploadSessionId?: string } = {}
): FormData {
  const fd = new FormData();
  if (ctx.dealId) fd.append("dealId", ctx.dealId);
  if (ctx.companyName) fd.append("businessName", ctx.companyName);
  if (ctx.statedRevenue) {
    fd.append("statedRevenue", ctx.statedRevenue.replace(/[^0-9.]/g, ""));
  }
  if (ctx.uploadSessionId) {
    fd.append("uploadSessionId", ctx.uploadSessionId);
  } else {
    for (const file of files) {
      fd.append("statements", file, file.name);
    }
  }
  fd.append(
    "applicationData",
    JSON.stringify({
      companyName: ctx.companyName || "",
      taxId: "",
      businessAddress: "",
    })
  );
  return fd;
}

export function extractStatementId(json: Record<string, unknown>): string | null {
  const data = json.data as Record<string, unknown> | undefined;
  const id =
    data?.id ??
    data?._id ??
    json.statementId ??
    json.id ??
    json._id;
  return id != null ? String(id) : null;
}

export async function triageStatements(
  files: File[],
  ctx: UploadContext = {}
): Promise<TriageResult> {
  const res = await fetch(`${API_BASE}${triagePath(ctx.usePublicUpload)}`, {
    method: "POST",
    headers: authHeaders(),
    body: buildBatchFormData(files, ctx),
  });
  const json = (await res.json().catch(() => ({}))) as TriageResult;
  if (!res.ok || json.success === false) {
    throw new Error(json.error || json.message || `Triage failed (${res.status})`);
  }
  return json;
}

export async function runBatchAnalysis(
  files: File[],
  ctx: UploadContext & { uploadSessionId: string; correlationId?: string } = {
    uploadSessionId: "",
  }
): Promise<{ status: number; json: Record<string, unknown>; correlationId: string }> {
  const correlationId =
    ctx.correlationId ??
    (typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : `batch-${Date.now()}`);

  const res = await fetch(`${API_BASE}${batchPath(ctx.usePublicUpload)}`, {
    method: "POST",
    headers: {
      ...authHeaders(),
      "X-Correlation-Id": correlationId,
    },
    body: buildBatchFormData(files, ctx),
  });

  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return {
    status: res.status,
    json,
    correlationId: String(json.correlationId ?? correlationId),
  };
}

const PROGRESS_RETRY_ATTEMPTS = 3;
const PROGRESS_RETRY_MS = 2000;

export const ANALYSIS_SERVER_LOST_MESSAGE =
  "Connection to analysis server lost. Please check if backend is running on port 3000.";

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function isRetryableServerError(status: number): boolean {
  return status === 500 || status === 502 || status === 503;
}

/**
 * Poll batch progress.
 * - 404 = no progress yet for this correlation id (normal) → return null
 * - 5xx / network = retry up to 3 times (2s apart), then throw
 */
export async function fetchBatchProgress(
  correlationId: string,
  usePublicUpload?: boolean
): Promise<BatchProgress | null> {
  const url = `${API_BASE}${progressPath(correlationId, usePublicUpload)}`;
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= PROGRESS_RETRY_ATTEMPTS; attempt++) {
    try {
      const res = await fetch(url, { headers: authHeaders() });
      // API returns 404 when progress has not been written yet — not a hard failure.
      if (res.status === 404) return null;
      if (isRetryableServerError(res.status)) {
        lastError = new Error(ANALYSIS_SERVER_LOST_MESSAGE);
        if (attempt < PROGRESS_RETRY_ATTEMPTS) {
          await sleep(PROGRESS_RETRY_MS);
          continue;
        }
        throw lastError;
      }
      if (!res.ok) return null;
      const json = await res.json().catch(() => ({}));
      return (json.progress ?? null) as BatchProgress | null;
    } catch (e) {
      lastError =
        e instanceof Error ? e : new Error(ANALYSIS_SERVER_LOST_MESSAGE);
      if (lastError.message === ANALYSIS_SERVER_LOST_MESSAGE && attempt >= PROGRESS_RETRY_ATTEMPTS) {
        throw lastError;
      }
      if (attempt < PROGRESS_RETRY_ATTEMPTS) {
        await sleep(PROGRESS_RETRY_MS);
        continue;
      }
      throw lastError.message.includes("analysis server")
        ? lastError
        : new Error(ANALYSIS_SERVER_LOST_MESSAGE);
    }
  }

  throw lastError ?? new Error(ANALYSIS_SERVER_LOST_MESSAGE);
}

export async function fetchBatchJob(
  jobId: string,
  usePublicUpload?: boolean
): Promise<BatchJobStatus> {
  const url = `${API_BASE}${jobPath(jobId, usePublicUpload)}`;
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= PROGRESS_RETRY_ATTEMPTS; attempt++) {
    try {
      const res = await fetch(url, { headers: authHeaders() });
      const json = (await res.json().catch(() => ({}))) as BatchJobStatus;
      if (res.status === 404 || isRetryableServerError(res.status)) {
        lastError = new Error(
          res.status === 404
            ? `Job poll failed (404)`
            : ANALYSIS_SERVER_LOST_MESSAGE
        );
        if (attempt < PROGRESS_RETRY_ATTEMPTS) {
          await sleep(PROGRESS_RETRY_MS);
          continue;
        }
        throw res.status === 404
          ? new Error(ANALYSIS_SERVER_LOST_MESSAGE)
          : lastError;
      }
      if (!res.ok) {
        throw new Error(json.error || json.message || `Job poll failed (${res.status})`);
      }
      return json;
    } catch (e) {
      const err = e instanceof Error ? e : new Error(ANALYSIS_SERVER_LOST_MESSAGE);
      const retryable =
        err.message === ANALYSIS_SERVER_LOST_MESSAGE ||
        /Job poll failed \(404\)|Failed to fetch|NetworkError|ECONNREFUSED|fetch failed/i.test(
          err.message
        );
      if (retryable && attempt < PROGRESS_RETRY_ATTEMPTS) {
        lastError = new Error(ANALYSIS_SERVER_LOST_MESSAGE);
        await sleep(PROGRESS_RETRY_MS);
        continue;
      }
      throw retryable ? new Error(ANALYSIS_SERVER_LOST_MESSAGE) : err;
    }
  }

  throw lastError ?? new Error(ANALYSIS_SERVER_LOST_MESSAGE);
}

export async function pollBatchJob(
  jobId: string,
  options: {
    correlationId?: string;
    usePublicUpload?: boolean;
    onProgress?: (progress: BatchProgress | null) => void;
    maxMs?: number;
  } = {}
): Promise<Record<string, unknown> | HitlBatchResult | BankConfirmBatchResult> {
  const maxMs = options.maxMs ?? 30 * 60 * 1000;
  const started = Date.now();
  let interval = 5000;

  const pollProgress = async () => {
    if (!options.correlationId || !options.onProgress) return;
    const p = await fetchBatchProgress(options.correlationId, options.usePublicUpload);
    options.onProgress(p);
  };

  while (Date.now() - started < maxMs) {
    await pollProgress();
    const payload = await fetchBatchJob(jobId, options.usePublicUpload);

    if (payload.status === "completed" && payload.result) {
      return payload.result as Record<string, unknown>;
    }
    if (payload.status === "COMPLETED_WITH_WARNINGS" && payload.result) {
      return payload.result as Record<string, unknown>;
    }
    if (payload.status === "REQUIRES_HUMAN_REVIEW") {
      return {
        hitl: true,
        status: "REQUIRES_HUMAN_REVIEW",
        processingRunId: payload.processingRunId ?? null,
        fileName: payload.fileName ?? null,
        reviewPayload: (payload.reviewPayload as Record<string, unknown> | null) ?? null,
        message:
          payload.message ||
          "Checksum reconciliation failed — human review required.",
        result: (payload.result as Record<string, unknown> | null) ?? null,
      };
    }
    if (payload.status === "failed") {
      throw new Error(payload.error || "Macro analysis failed");
    }
    if (
      payload.status === "requires_bank_confirmation" ||
      payload.requiresBankConfirmation
    ) {
      // #region agent log
      fetch("http://127.0.0.1:7779/ingest/14ba3817-11f8-4e9c-85f8-0a9bab98d3ad", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Debug-Session-Id": "655110",
        },
        body: JSON.stringify({
          sessionId: "655110",
          runId: "bank-confirm-fix",
          hypothesisId: "H-BANK",
          location: "batchUploadClient.ts:pollBatchJob",
          message: "requires_bank_confirmation terminal",
          data: {
            fileName: payload.fileName ?? null,
            detectedBankName: payload.detectedBankName ?? null,
            hasSession: Boolean(payload.uploadSessionId),
          },
          timestamp: Date.now(),
        }),
      }).catch(() => {});
      // #endregion
      return {
        bankConfirm: true,
        status: "requires_bank_confirmation",
        uploadSessionId: payload.uploadSessionId ?? null,
        fileName: payload.fileName ?? null,
        detectedBankName: payload.detectedBankName ?? null,
        bankNameCandidates: payload.bankNameCandidates ?? [],
        message: payload.message,
        previewUrl: payload.previewUrl ?? null,
      };
    }

    await new Promise((r) => setTimeout(r, interval));
    interval = Math.min(interval + 1000, 12000);
  }

  throw new Error("Macro analysis timed out after 30 minutes");
}

/** POST confirm-bank — resume batch after Identity Waterfall Level 4. */
export async function confirmBankAndResume(
  body: {
    uploadSessionId: string;
    fileName: string;
    confirmedBankName: string;
  },
  usePublicUpload?: boolean
): Promise<{ jobId?: string; correlationId?: string; error?: string; message?: string }> {
  const url = `${API_BASE}${confirmBankPath(usePublicUpload)}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { ...authHeaders(), "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as {
    jobId?: string;
    correlationId?: string;
    error?: string;
    message?: string;
  };
  if (!res.ok || !json.jobId) {
    throw new Error(json.error || json.message || `Confirm bank failed (${res.status})`);
  }
  return json;
}

export type ProcessingRunDoc = {
  _id?: string;
  status?: string;
  uploadSessionId?: string;
  failingFileNames?: string[];
  reviewPayload?: Record<string, unknown> | null;
  rtn?: string;
  correlationId?: string;
  jobId?: string;
};

/** GET /api/processing-runs/:id (JWT or /public when enabled). */
export async function fetchProcessingRun(
  runId: string,
  options: { usePublicUpload?: boolean } = {}
): Promise<ProcessingRunDoc> {
  const pub = options.usePublicUpload ?? USE_PUBLIC;
  const path = pub
    ? `/api/processing-runs/${encodeURIComponent(runId)}/public`
    : `/api/processing-runs/${encodeURIComponent(runId)}`;
  const res = await fetch(`${API_BASE}${path}`, {
    headers: authHeaders(),
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok || json.success === false) {
    throw new Error(
      String(json.error || json.message || `ProcessingRun fetch failed (${res.status})`)
    );
  }
  const run = (json.processingRun || json) as ProcessingRunDoc;
  return run;
}

/**
 * Fetch triage-session PDF as a File for HitlWorkspace when the staged File is gone.
 * GET /api/statements/batch/triage/:uploadSessionId/file/:fileName
 */
export async function fetchTriagePdfFile(
  uploadSessionId: string,
  fileName: string,
  options: { usePublicUpload?: boolean } = {}
): Promise<File> {
  const pub = options.usePublicUpload ?? USE_PUBLIC;
  const base = pub
    ? `/api/statements/batch/triage/${encodeURIComponent(uploadSessionId)}/file/${encodeURIComponent(fileName)}/public`
    : `/api/statements/batch/triage/${encodeURIComponent(uploadSessionId)}/file/${encodeURIComponent(fileName)}`;
  const res = await fetch(`${API_BASE}${base}`, {
    headers: authHeaders(),
    cache: "no-store",
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(
      `Triage PDF fetch failed (${res.status})${errText ? `: ${errText.slice(0, 120)}` : ""}`
    );
  }
  const blob = await res.blob();
  return new File([blob], fileName, {
    type: blob.type || "application/pdf",
  });
}

export async function resolveProcessingRun(
  runId: string,
  corrections: {
    openingBalance: number;
    closingBalance: number;
    totalDeposits: number;
    totalWithdrawals: number;
    transactions?: unknown[];
  },
  options: { fileName?: string; rtn?: string; usePublicUpload?: boolean } = {}
): Promise<Record<string, unknown>> {
  const pub = options.usePublicUpload ?? USE_PUBLIC;
  const path = pub
    ? `/api/processing-runs/${encodeURIComponent(runId)}/resolve/public`
    : `/api/processing-runs/${encodeURIComponent(runId)}/resolve`;
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: {
      ...authHeaders(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      corrections,
      fileName: options.fileName,
      rtn: options.rtn,
    }),
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok || json.success === false) {
    throw new Error(String(json.error || json.message || `Resolve failed (${res.status})`));
  }
  return json;
}

export function redirectToDashboard(statementId: string, token?: string | null) {
  const t = token ?? getStoredToken();
  window.location.href = getDashboardUrl(statementId, t);
}

export async function fetchAuthStatus(): Promise<{
  authDisabled: boolean;
  apiKeyDisabled: boolean;
}> {
  const res = await fetch(`${API_BASE}/api/testing/auth-status`, { cache: "no-store" });
  if (!res.ok) return { authDisabled: false, apiKeyDisabled: false };
  return res.json();
}
