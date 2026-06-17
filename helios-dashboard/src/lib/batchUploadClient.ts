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
  institutionProfileGate?: {
    step1Required?: boolean;
    productionReady?: boolean;
    profileStatus?: string;
    codeProfileId?: string;
    bankName?: string | null;
    routingNumber?: string | null;
    recommendation?: string | null;
    layoutDiscoveryStatus?: string;
    layoutMapped?: boolean;
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
  message?: string;
};

export type UploadContext = {
  companyName?: string;
  statedRevenue?: string;
  dealId?: string;
  usePublicUpload?: boolean;
  /** When true, run macro analysis even if institution profile Step 1 is incomplete */
  allowProbeAnalysis?: boolean;
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
  if (ctx.allowProbeAnalysis !== false) {
    const layoutLearningDefault =
      process.env.NEXT_PUBLIC_USE_PUBLIC_UPLOAD === "true" ||
      process.env.NODE_ENV !== "production";
    if (ctx.allowProbeAnalysis || layoutLearningDefault) {
      fd.append("allowProbeAnalysis", "true");
    }
  }
  return fd;
}

/** Human-readable batch/triage failure from API JSON (gate block, bank confirm, etc.). */
export function formatBatchError(
  json: Record<string, unknown>,
  status?: number
): string {
  const code = String(json.error ?? "");
  const gate = json.institutionProfileGate as
    | { recommendation?: string | null; bankName?: string | null }
    | undefined;

  if (code === "INSTITUTION_PROFILE_STEP1_REQUIRED") {
    const bank = gate?.bankName ? ` (${gate.bankName})` : "";
    return (
      gate?.recommendation ||
      `Institution profile Step 1 required${bank}. Enable layout learning or complete profile graduation.`
    );
  }

  if (json.message && typeof json.message === "string") {
    return json.message;
  }
  if (json.error && typeof json.error === "string" && json.error !== code) {
    return json.error;
  }
  if (status != null) {
    return `Batch failed (${status})`;
  }
  return "Batch analysis failed";
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

export async function fetchBatchProgress(
  correlationId: string,
  usePublicUpload?: boolean
): Promise<BatchProgress | null> {
  const res = await fetch(`${API_BASE}${progressPath(correlationId, usePublicUpload)}`, {
    headers: authHeaders(),
  });
  if (!res.ok) return null;
  const json = await res.json().catch(() => ({}));
  return (json.progress ?? null) as BatchProgress | null;
}

export async function fetchBatchJob(
  jobId: string,
  usePublicUpload?: boolean
): Promise<BatchJobStatus> {
  const res = await fetch(`${API_BASE}${jobPath(jobId, usePublicUpload)}`, {
    headers: authHeaders(),
  });
  const json = (await res.json().catch(() => ({}))) as BatchJobStatus;
  if (!res.ok) {
    throw new Error(json.error || json.message || `Job poll failed (${res.status})`);
  }
  return json;
}

export async function pollBatchJob(
  jobId: string,
  options: {
    correlationId?: string;
    usePublicUpload?: boolean;
    onProgress?: (progress: BatchProgress | null) => void;
    maxMs?: number;
  } = {}
): Promise<Record<string, unknown>> {
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
    if (payload.status === "failed") {
      throw new Error(payload.error || "Macro analysis failed");
    }
    if (payload.status === "requires_bank_confirmation") {
      throw new Error(
        payload.message ||
          `Bank confirmation required for ${payload.fileName ?? "statement"}`
      );
    }

    await new Promise((r) => setTimeout(r, interval));
    interval = Math.min(interval + 1000, 12000);
  }

  throw new Error(
    `Macro analysis timed out after 30 minutes (correlationId: ${options.correlationId ?? "unknown"})`
  );
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
