/**
 * Maps Statement / Helios envelope JSON → chronological AI audit timeline events.
 */

export type TelemetryStatus =
  | "success"
  | "failed"
  | "rescued"
  | "info"
  | "skipped";

export type TelemetryEvent = {
  id: string;
  name: string;
  kind: "parse" | "checksum" | "ai_rescue" | "llm_cost" | "vera" | "pipeline";
  status: TelemetryStatus;
  durationMs: number | null;
  costUsd: number | null;
  /** UI hint when totalCost is 0/null — show "< $0.01" or "Tracking Pending". */
  costDisplay?: "< $0.01" | "Tracking Pending" | null;
  detail?: string;
  aiDriven?: boolean;
  fileName?: string;
  /** Vera auto-routing / provider fallback. */
  warning?: boolean;
  /** Multi-file aggregate stats (Standard Parse / checksum). */
  aggregate?: {
    fileCount: number;
    filesPassed: number;
    filesFailed: number;
    transactionCount: number;
  };
};

type ParseQualityRow = {
  fileName?: string;
  checksumOk?: boolean;
  parseQuality?: string;
  transactionCount?: number;
  layoutPipelineShadow?: {
    layoutFirstWins?: boolean;
    checksumOkLegacy?: boolean;
    checksumOkLayoutFirst?: boolean;
    checksumMatch?: boolean;
  } | null;
};

type LlmCostTracking = {
  totalCost?: number | null;
  transactionsCategorized?: number;
  costPerTransaction?: number;
  service?: string;
};

type VeraMetadata = {
  model?: string;
  durationMs?: number;
  source?: string;
  fallback?: boolean;
  generatedAt?: string;
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return Boolean(v) && typeof v === "object" && !Array.isArray(v);
}

/** Resolve statement root from envelope, statement, or analysis-bearing object. */
function resolveStatement(input: unknown): Record<string, unknown> | null {
  if (!isRecord(input)) return null;
  if (isRecord(input.data) && isRecord(input.data.statement)) {
    return input.data.statement;
  }
  if (isRecord(input.statement)) return input.statement;
  if (isRecord(input.analysis) || Array.isArray(input.transactions)) {
    return input;
  }
  return null;
}

function asParseQualityRows(raw: unknown): ParseQualityRow[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(isRecord) as ParseQualityRow[];
}

function collectTransactions(statement: Record<string, unknown>): Array<
  Record<string, unknown>
> {
  const out: Array<Record<string, unknown>> = [];
  const top = statement.transactions;
  if (Array.isArray(top)) {
    for (const t of top) {
      if (isRecord(t)) out.push(t);
    }
  }
  const analysis = isRecord(statement.analysis) ? statement.analysis : null;
  const nested = analysis?.transactions;
  if (Array.isArray(nested)) {
    for (const t of nested) {
      if (isRecord(t)) out.push(t);
    }
  }
  return out;
}

/** AI Vision rescue — canonical `ai_vision_fallback` or legacy `gemini_row_fallback`. */
function isAiVisionFallbackSource(src: unknown): boolean {
  if (typeof src !== "string") return false;
  const s = src.toLowerCase();
  return (
    s === "ai_vision_fallback" ||
    s === "gemini_row_fallback" ||
    s.includes("ai_vision_fallback") ||
    (s.includes("gemini") && s.includes("fallback"))
  );
}

function hasAiVisionExtraction(txns: Array<Record<string, unknown>>): boolean {
  return txns.some((t) => isAiVisionFallbackSource(t.extractionSource));
}

function shadowSuggestsRescue(rows: ParseQualityRow[]): boolean {
  return rows.some((r) => {
    const shadow = r.layoutPipelineShadow;
    if (!shadow) return false;
    if (shadow.layoutFirstWins) return true;
    if (
      shadow.checksumOkLegacy === false &&
      shadow.checksumOkLayoutFirst === true
    ) {
      return true;
    }
    if (shadow.checksumMatch === false) return true;
    return false;
  });
}

function aggregateParseQuality(rows: ParseQualityRow[]) {
  let transactionCount = 0;
  let filesPassed = 0;
  let filesFailed = 0;
  for (const row of rows) {
    const n = Number(row.transactionCount);
    if (Number.isFinite(n) && n > 0) transactionCount += n;
    const failed =
      row.checksumOk === false ||
      String(row.parseQuality || "").toUpperCase() === "FAILED_CHECKSUM";
    if (failed) filesFailed += 1;
    else filesPassed += 1;
  }
  return {
    fileCount: rows.length,
    filesPassed,
    filesFailed,
    transactionCount,
  };
}

function resolveLlmCost(tracking: LlmCostTracking | null | undefined): {
  costUsd: number | null;
  costDisplay: TelemetryEvent["costDisplay"];
  detail: string;
  status: TelemetryStatus;
} {
  if (!tracking || typeof tracking !== "object") {
    return {
      costUsd: null,
      costDisplay: "Tracking Pending",
      detail: "LLM cost tracking not present on statement metadata",
      status: "info",
    };
  }
  const raw = tracking.totalCost;
  const service = tracking.service || "LLM";
  const categorized = tracking.transactionsCategorized;
  const detailParts = [service];
  if (categorized != null && Number.isFinite(categorized)) {
    detailParts.push(`${categorized} txns categorized`);
  }

  if (raw == null || !Number.isFinite(Number(raw))) {
    return {
      costUsd: null,
      costDisplay: "Tracking Pending",
      detail: detailParts.join(" · "),
      status: "info",
    };
  }
  const total = Number(raw);
  if (total <= 0) {
    return {
      costUsd: null,
      costDisplay: "< $0.01",
      detail: detailParts.join(" · "),
      status: "success",
    };
  }
  return {
    costUsd: total,
    costDisplay: null,
    detail: detailParts.join(" · "),
    status: "success",
  };
}

/**
 * Extract chronological telemetry events from Statement JSON / Helios payload.
 */
export function parseTelemetryTimeline(statementJson: unknown): TelemetryEvent[] {
  const events: TelemetryEvent[] = [];
  const statement = resolveStatement(statementJson);
  if (!statement) return events;

  const analysis = isRecord(statement.analysis) ? statement.analysis : {};
  const metadata = isRecord(analysis.metadata) ? analysis.metadata : {};
  const rows = asParseQualityRows(metadata.parseQualityByFile);
  const agg = aggregateParseQuality(rows);
  const txns = collectTransactions(statement);

  // 1. Standard Parse (aggregated)
  if (rows.length === 0) {
    events.push({
      id: "parse-standard",
      name: "Standard Parse (PDF Plumber Extraction)",
      kind: "parse",
      status: "info",
      durationMs: null,
      costUsd: null,
      detail: "No parseQualityByFile entries on this statement",
      aggregate: {
        fileCount: 0,
        filesPassed: 0,
        filesFailed: 0,
        transactionCount: 0,
      },
    });
  } else {
    const parseStatus: TelemetryStatus =
      agg.filesFailed > 0 ? "failed" : "success";
    events.push({
      id: "parse-standard",
      name: "Standard Parse (PDF Plumber Extraction)",
      kind: "parse",
      status: parseStatus,
      durationMs: null,
      costUsd: null,
      detail: `${agg.fileCount} file${agg.fileCount === 1 ? "" : "s"} · ${agg.filesPassed} passed checksum · ${agg.filesFailed} failed · ${agg.transactionCount} txns`,
      aggregate: agg,
    });
  }

  // 2. Micro-Checksum Validation (rollup)
  if (rows.length > 0) {
    const checksumStatus: TelemetryStatus =
      agg.filesFailed > 0 ? "failed" : "success";
    events.push({
      id: "checksum-micro",
      name: "Micro-Checksum Validation",
      kind: "checksum",
      status: checksumStatus,
      durationMs: null,
      costUsd: null,
      detail: `${agg.filesPassed}/${agg.fileCount} files passed · ${agg.filesFailed} failed`,
      aggregate: agg,
    });
  }

  // 3. AI Vision Rescue (legacy extractionSource: gemini_row_fallback)
  const aiVisionHit = hasAiVisionExtraction(txns);
  const anyChecksumFail = agg.filesFailed > 0;
  const shadowRescue = shadowSuggestsRescue(rows);
  const rescueTriggered = aiVisionHit || (anyChecksumFail && shadowRescue);

  if (rescueTriggered) {
    const aiVisionCount = txns.filter((t) =>
      isAiVisionFallbackSource(t.extractionSource)
    ).length;
    events.push({
      id: "ai-rescue-vision",
      name: "AI Vision Rescue",
      kind: "ai_rescue",
      status: "rescued",
      durationMs: null,
      costUsd: null,
      aiDriven: true,
      detail: aiVisionHit
        ? `${aiVisionCount} txn(s) with AI Vision extractionSource`
        : "Layout-first / shadow path after checksum failure",
    });
  } else {
    events.push({
      id: "ai-rescue-vision",
      name: "AI Vision Rescue",
      kind: "ai_rescue",
      status: "skipped",
      durationMs: null,
      costUsd: null,
      aiDriven: true,
      detail: "Not triggered",
    });
  }

  // 4. LLM Categorization Cost
  const llmRaw = metadata.llmCostTracking;
  const llm = isRecord(llmRaw) ? (llmRaw as LlmCostTracking) : null;
  const llmResolved = resolveLlmCost(llm);
  events.push({
    id: "llm-cost",
    name: "LLM Categorization Cost",
    kind: "llm_cost",
    status: llmResolved.status,
    durationMs: null,
    costUsd: llmResolved.costUsd,
    costDisplay: llmResolved.costDisplay,
    detail: llmResolved.detail,
    aiDriven: true,
  });

  // 5. Vera AI Underwriting
  const vera = isRecord(analysis.vera) ? analysis.vera : null;
  if (vera) {
    const veraMeta = isRecord(vera.metadata)
      ? (vera.metadata as VeraMetadata)
      : {};
    const model = veraMeta.model || "unknown";
    const source = veraMeta.source;
    const durationMs =
      veraMeta.durationMs != null && Number.isFinite(Number(veraMeta.durationMs))
        ? Number(veraMeta.durationMs)
        : null;
    const fallback = veraMeta.fallback === true;
    const decision =
      typeof vera.decision === "string" ? vera.decision : null;
    events.push({
      id: "vera-underwriting",
      name: "Vera AI Underwriting",
      kind: "vera",
      status: fallback ? "info" : "success",
      durationMs,
      costUsd: null,
      aiDriven: true,
      warning: fallback,
      detail: [model, source, decision ? `decision=${decision}` : null]
        .filter(Boolean)
        .join(" · "),
    });
  }

  // 6. Macro Pipeline
  const processingDuration = metadata.processingDuration;
  const pipelineMs =
    processingDuration != null && Number.isFinite(Number(processingDuration))
      ? Number(processingDuration)
      : null;
  if (pipelineMs != null || events.length > 0) {
    events.push({
      id: "macro-pipeline",
      name: "Macro Pipeline",
      kind: "pipeline",
      status: "info",
      durationMs: pipelineMs,
      costUsd: null,
      detail:
        pipelineMs != null
          ? "End-to-end macro analysis wall time"
          : "processingDuration not recorded",
    });
  }

  return events;
}
