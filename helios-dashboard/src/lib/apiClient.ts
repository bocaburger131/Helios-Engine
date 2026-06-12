import type { HeliosStatementPayload } from "@/lib/analysisAdapter";

export const API_BASE =
  process.env.NEXT_PUBLIC_HELIOS_API_URL?.replace(/\/$/, "") ||
  "http://localhost:3000";

export const DASHBOARD_BASE =
  process.env.NEXT_PUBLIC_DASHBOARD_URL?.replace(/\/$/, "") ||
  (typeof window !== "undefined" ? window.location.origin : "http://localhost:3002");

export const USE_DEV_API =
  process.env.NEXT_PUBLIC_USE_DEV_API === "true";

export const TOKEN_STORAGE_KEY = "bsaDashboardToken";

export function getStoredToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_STORAGE_KEY);
}

export function setStoredToken(token: string): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(TOKEN_STORAGE_KEY, token);
}

export function authHeaders(token?: string | null): HeadersInit {
  const headers: HeadersInit = { Accept: "application/json" };
  const t = token ?? getStoredToken();
  if (t) headers.Authorization = `Bearer ${t}`;
  return headers;
}

export function getDashboardUrl(statementId: string, token?: string | null): string {
  const base = DASHBOARD_BASE;
  const qs = token ? `?token=${encodeURIComponent(token)}` : "";
  return `${base}/dashboard/${encodeURIComponent(statementId)}${qs}`;
}

export async function fetchStatementById(
  id: string,
  token?: string | null
): Promise<HeliosStatementPayload> {
  const path = USE_DEV_API
    ? `${API_BASE}/api/dev/statements/${id}`
    : `${API_BASE}/api/statements/${id}`;

  const res = await fetch(path, {
    headers: authHeaders(token),
    cache: "no-store",
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Helios API ${res.status}: ${body.slice(0, 200) || res.statusText}`);
  }

  return res.json() as Promise<HeliosStatementPayload>;
}

export type LayoutPipelineShadow = {
  checksumOkLegacy?: boolean;
  checksumOkLayoutFirst?: boolean;
  checksumMatch?: boolean;
  txnCountDelta?: number;
  legacyTxnCount?: number;
  newTxnCount?: number;
  depositDelta?: number | null;
  withdrawalDelta?: number | null;
  profileIdLegacy?: string | null;
  profileIdLayoutFirst?: string | null;
  profileIdMatch?: boolean;
  depositInflationLegacy?: number | null;
  depositInflationNew?: number | null;
  layoutFirstWins?: boolean;
  promoteCandidate?: boolean;
};

export type ParseReconciliation = {
  checksumOk?: boolean;
  parsedDeposits?: number;
  parsedWithdrawals?: number;
  printedDeposits?: number;
  printedWithdrawals?: number;
  computedClosing?: number;
  closing?: number;
  depositsMatch?: boolean;
  withdrawalsMatch?: boolean;
  closingMatch?: boolean;
};

export type DevParseResult = {
  fileName: string;
  bankName?: string;
  accountNumber?: string;
  profileId?: string;
  profileConfidence?: number;
  extractionTier?: number | null;
  txnCount: number;
  balances: { opening?: number | null; closing?: number | null };
  reconciliation: ParseReconciliation | null;
  layoutPipelineShadow: LayoutPipelineShadow | null;
  stitcherPrinted?: {
    opening?: number;
    closing?: number;
    totalDeposits?: number;
    totalWithdrawals?: number;
  };
  transactionsSample: Array<{
    date?: string;
    description?: string;
    amount?: number;
    type?: string;
  }>;
};

export type DevConfig = {
  layoutFirstShadow: boolean;
  layoutFirstPrimary: boolean;
  testMode: boolean;
  apiPort: number | string;
};

export type StatementListItem = {
  id?: string;
  _id?: string;
  fileName?: string;
  bankName?: string;
  status?: string;
  uploadDate?: string;
  monthsAnalyzed?: number;
  veraDecision?: string;
};

export async function fetchDevConfig(): Promise<DevConfig> {
  const res = await fetch(`${API_BASE}/api/dev/config`, { cache: "no-store" });
  if (!res.ok) throw new Error(`Config ${res.status}`);
  const json = await res.json();
  return json.data as DevConfig;
}

export async function parseStatementPdf(
  file: File,
  opts: { shadow?: boolean; primary?: boolean; vera?: boolean } = {}
): Promise<DevParseResult> {
  const form = new FormData();
  form.append("statement", file);

  const params = new URLSearchParams();
  if (opts.shadow === false) params.set("shadow", "0");
  if (opts.primary) params.set("primary", "1");
  if (opts.vera === false) params.set("vera", "0");

  const qs = params.toString();
  const url = `${API_BASE}/api/dev/parse-statement${qs ? `?${qs}` : ""}`;

  const res = await fetch(url, { method: "POST", body: form });
  const json = await res.json();
  if (!res.ok || !json.success) {
    throw new Error(json.error || `Parse failed (${res.status})`);
  }
  return json.data as DevParseResult;
}

export async function fetchDevStatements(limit = 20): Promise<StatementListItem[]> {
  const res = await fetch(
    `${API_BASE}/api/dev/statements?limit=${limit}&page=1`,
    { cache: "no-store" }
  );
  if (!res.ok) throw new Error(`Statements ${res.status}`);
  const json = await res.json();
  return (json.data?.statements ?? []) as StatementListItem[];
}

export function formatMoney(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  });
}
