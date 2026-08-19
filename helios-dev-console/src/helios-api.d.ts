export type ServiceId = "helios" | "docker" | "ngrok";

export type LogPayload = {
  source: ServiceId | "system" | "nuke";
  stream: "stdout" | "stderr" | "system";
  line: string;
  ts?: number;
};

export type ServiceStatus = {
  running: boolean;
  isRunning?: boolean;
  isHealthy?: boolean;
  pid?: number | null;
  detail?: string;
  details?: string;
};

export type ServiceStatusMap = Record<ServiceId, ServiceStatus>;

export type ReportReadResult = {
  path: string;
  missing: boolean;
  headers: string[];
  rows: Record<string, string>[];
};

export type DbStatus = {
  redis: { ok: boolean; container: string; port: string; detail?: string };
  mongo: { ok: boolean; container: string; port: string; detail?: string };
};

export type SimToggles = {
  DISABLE_AI_RESCUER: boolean;
  ZOHO_DEMO_MODE: boolean;
  SALESFORCE_DEMO_MODE: boolean;
  DEMO_MODE: boolean;
  DISABLE_AUTH: boolean;
  ENABLE_PUBLIC_UPLOAD: boolean;
  FORCE_HITL_ROUTING: boolean;
  USE_MOCK_SERVICES: boolean;
  AI_DIAGNOSTIC_RESCUE_ENABLED: boolean;
  DISABLE_LAYOUT_STITCHER: boolean;
  DISABLE_LAYOUT_LEARNING: boolean;
  DISABLE_LLM_CATEGORIZER: boolean;
  DISABLE_VERA_BRIEFING: boolean;
};

export type AiModelKey =
  | "LAYOUT_AI_MODEL"
  | "RESCUER_AI_MODEL"
  | "CATEGORIZER_AI_MODEL"
  | "ANALYSIS_AI_MODEL";

export type AiModelTag = "vision" | "thinking" | "code" | "general";

export type AiModelCatalogEntry = {
  id: string;
  tags: AiModelTag[];
  name?: string;
  provider?: string;
  custom?: boolean;
};

export type AiModels = Record<AiModelKey, string>;

export type AiModelsResult = {
  ok?: boolean;
  path: string;
  models: AiModels;
  options: string[];
  catalog?: AiModelCatalogEntry[];
  apiReady?: Record<string, boolean>;
  providerEnvLabel?: Record<string, string>;
  raw?: string;
  error?: string;
};

export type AddCustomModelPayload = {
  id: string;
  name: string;
  provider:
    | "openai"
    | "anthropic"
    | "google"
    | "perplexity"
    | "openrouter"
    | "mistral"
    | "deepseek"
    | "ollama"
    | "custom";
  tags: AiModelTag[];
  apiKey?: string;
};

export type SimToggleResult = {
  path: string;
  toggles: SimToggles;
  raw: string;
  ok?: boolean;
};

export type EnvPreviewResult = {
  envPath: string;
  overridePath: string;
  envPreview: string;
  overridePreview: string;
  toggles: SimToggles;
  models?: AiModels;
};

export type HitlQueuePayload = {
  _id?: string | { $oid?: string };
  uploadSessionId?: string;
  failingFileNames?: string[];
  status?: string;
  [key: string]: unknown;
};

export type HitlQueueItem = {
  id: string | null;
  fileName: string | null;
  uploadSessionId: string | null;
  rtn: string | null;
  status: string;
  createdAt?: string | null;
  failingFileNames: string[];
  reviewPayload?: Record<string, unknown> | null;
  localPdfPath: string | null;
  pdfPreviewUrl: string | null;
  extractedDeposits: number | null;
  printedDeposits: number | null;
  extractedWithdrawals: number | null;
  printedWithdrawals: number | null;
  delta: number | null;
  opening: number | null;
  closing: number | null;
  rowBalanceRecon?: {
    ok?: boolean;
    violations?: Array<{
      page?: number | null;
      rowIndex?: number;
      delta?: number;
      previous?: number;
      deposit?: number;
      withdrawal?: number;
      balance?: number;
      description?: string | null;
    }>;
  } | null;
  transactions?: Array<{
    rowIndex?: number;
    date?: string | null;
    description?: string | null;
    amount?: number | null;
    deposit?: number | null;
    withdrawal?: number | null;
    balance?: number | null;
    page?: number | null;
    type?: string | null;
    source?: string | null;
  }>;
};

export type HitlQueueResult = {
  ok: boolean;
  payload: HitlQueuePayload | null;
  error?: string | null;
};

export type HitlQueueListResult = {
  ok: boolean;
  items: HitlQueueItem[];
  error?: string | null;
};

export type HeliosApi = {
  startService: (
    id: ServiceId
  ) => Promise<{ ok: boolean; error?: string; detail?: string }>;
  stopService: (
    id: ServiceId
  ) => Promise<{ ok: boolean; error?: string; detail?: string }>;
  resetService: (
    id: ServiceId
  ) => Promise<{ ok: boolean; error?: string; detail?: string }>;
  getServiceStatus: () => Promise<ServiceStatusMap>;
  getLogHistory: (options?: {
    source?: ServiceId;
    maxLines?: number;
  }) => Promise<{ ok: boolean; lines: LogPayload[] }>;
  subscribeLogs: (handler: (payload: LogPayload) => void) => () => void;
  readReports: (options?: { path?: string }) => Promise<ReportReadResult>;
  listUploadReports: () => Promise<string[]>;
  getDbStatus: () => Promise<DbStatus>;
  nukeAndPave: () => Promise<{ ok: boolean; logs: string[]; error?: string }>;
  getSimToggles: () => Promise<SimToggleResult>;
  setSimToggles: (toggles: SimToggles) => Promise<SimToggleResult>;
  getAiModels: () => Promise<AiModelsResult>;
  setAiModels: (models: Partial<AiModels>) => Promise<AiModelsResult>;
  addCustomModel: (payload: AddCustomModelPayload) => Promise<AiModelsResult>;
  readEnvPreview: (options?: {
    presentationMode?: boolean;
  }) => Promise<EnvPreviewResult>;
  getHitlQueuePayload: () => Promise<HitlQueueResult>;
  /** Enriched HITL queue (checksum fields + PDF preview URL/path). */
  fetchHitlQueue: () => Promise<HitlQueueListResult>;
  /** Opens allowlisted http://localhost:3002/upload… URLs in the system browser. */
  openExternal: (url: string) => Promise<{ ok: boolean; error?: string }>;
};

declare global {
  interface Window {
    helios: HeliosApi;
  }
}

export {};
