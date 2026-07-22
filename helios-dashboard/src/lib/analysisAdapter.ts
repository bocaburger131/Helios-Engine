/**
 * Maps analysis_master / GET /api/statements/:id payload to Recharts series.
 * Primary source: monthlyStatementSummaries + underwritingVitals.adb.byMonth
 */

import type { LayoutPipelineShadow } from "@/lib/apiClient";
import {
  bucketByDay,
  bucketByWeek,
  filterDailyByL3mMonths,
  filterDailyByMonth,
  getChartActivityFromPayload,
  getOpeningBalanceFromSummaries,
  getTransactionsFromPayload,
  hasChartActivityData,
  resolveL3mMonthKeys,
  rollupDailyToActivityRows,
  rollupWeeklyToActivityRows,
  type ChartActivity,
} from "@/lib/dailyActivityAdapter";

export type { ChartActivity } from "@/lib/dailyActivityAdapter";

export type Horizon = "daily" | "weekly" | "single" | "monthly" | "l3m" | "quarterly";

export type ReconciliationLineDelta = {
  printed: number | null;
  parsed: number | null;
  delta: number | null;
  role: "credit" | "debit";
  match: boolean;
};

export type ReconciliationBreakdown = {
  checksumOk?: boolean | null;
  printedLines?: Record<string, number> | null;
  sectionTotals?: Record<string, number> | null;
  lineDeltas?: Record<string, ReconciliationLineDelta> | null;
  printedComputedClosing?: number | null;
  printedClosingMatch?: boolean | null;
  sectionReconciled?: boolean | null;
};

export type ReconciliationLineRow = {
  fileName: string;
  key: string;
  printed: number | null;
  parsed: number | null;
  delta: number | null;
  role: "credit" | "debit";
  match: boolean;
};

export type MonthlyStatementSummary = {
  fileName: string;
  totalDeposits?: number;
  totalWithdrawals?: number;
  openingBalance?: number;
  closingBalance?: number;
  parseQuality?: string;
  checksumOk?: boolean;
  reconciliation?: ReconciliationBreakdown | null;
  layoutPipelineShadow?: LayoutPipelineShadow | null;
  layoutDiscovery?: {
    documentMap?: {
      fingerprint?: string;
      regions?: Record<
        string,
        { type?: string; text?: string; pageIndex?: number | null; bbox?: unknown }
      >;
      mappingSource?: string;
    };
    contextArchive?: HeliosStatementPayload["data"]["statement"]["analysis"]["contextArchive"];
    fingerprint?: string | null;
    mappingSource?: string | null;
  } | null;
  feeTransactions?: Array<{
    date?: string;
    description?: string;
    amount?: number;
    category?: string;
    pageIndex?: number | null;
  }>;
  identityMap?: {
    legalName?: string | null;
    dba?: string | null;
    ein?: string | null;
    address?: string | null;
    anchorStatus?: string;
  };
  coveragePeriod?: {
    startDate?: string;
    endDate?: string;
    daysCovered?: number;
  };
  accountKey?: string;
};

export type AdbByMonth = {
  month: string;
  adb: number;
  daysInMonth?: number;
};

export type HeliosStatementPayload = {
  success?: boolean;
  data?: {
    statement?: {
      _id?: string;
      id?: string;
      bankName?: string;
      accountNumber?: string;
      applicationContext?: {
        companyName?: string;
        requestedLoanAmount?: number;
        statedRevenue?: number;
        annualRevenue?: number;
        businessAddress?: string;
        dealId?: string;
      };
      analysis?: {
        financialTotals?: {
          totalDeposits?: number;
          totalWithdrawals?: number;
          averageDailyBalance?: number;
        };
        forensicIntelligence?: {
          prospectiveDSCR?: number;
          window?: {
            monthlyBreakdown?: Array<{
              key?: string;
              label?: string;
              deposits?: number;
              withdrawals?: number;
            }>;
            monthlyNetCashFlow?: number;
            requestedLoanAmount?: number;
          };
        };
        nsfAndOverdraft?: {
          nsfCount?: number;
          overdraftCount?: number;
        };
        underwritingVitals?: {
          adb?: {
            l3mAverage?: number;
            byMonth?: AdbByMonth[];
          };
          nsfAndOverdraft?: {
            nsfCount?: number;
            overdraftCount?: number;
          };
        };
        chartActivity?: ChartActivity | null;
        vera?: {
          decision?: string;
          bankabilityScore?: number;
          briefingMarkdown?: string;
          deltaFixes?: Array<{
            field?: string;
            proposedValue?: number | string;
            confidence?: number;
            rationale?: string;
          }>;
          identityCrossCheck?: {
            status?: string;
            confidence?: number;
            mismatches?: Array<{
              field?: string;
              expected?: string;
              observed?: string;
            }>;
          };
        };
        documentMap?: {
          fingerprint?: string;
          regions?: Record<
            string,
            { type?: string; text?: string; pageIndex?: number | null; bbox?: unknown }
          >;
          ignoredRegions?: Array<{
            id?: string;
            regionType?: string;
            type?: string;
            text?: string;
            pageIndex?: number | null;
            classificationReason?: string | null;
          }>;
          blocks?: Array<{
            id?: string;
            regionType?: string;
            role?: string;
            text?: string;
            pageIndex?: number | null;
          }>;
          coverage?: {
            totalBlocks?: number;
            financialBlocks?: number;
            ignoredBlocks?: number;
          };
        };
        contextArchive?: {
          version?: string;
          fingerprint?: string;
          entries?: Array<{
            id?: string;
            regionType?: string;
            pageIndex?: number | null;
            excerpt?: string;
            charCount?: number;
            classificationReason?: string | null;
          }>;
          stats?: {
            totalBlocks?: number;
            financialBlocks?: number;
            ignoredBlocks?: number;
            ignoredByType?: Record<string, number>;
          };
        };
        projections?: {
          l3mMovingAverage?: number;
          projectedDSCR?: number;
          eligibilityBand?: string;
        };
        metadata?: {
          transactionPersist?: {
            attempted?: number;
            persisted?: number;
            skipped?: { invalidDate?: number; invalidAmount?: number };
            error?: string | null;
          };
          parseQualityByFile?: Array<{
            fileName?: string;
            checksumOk?: boolean;
            parseQuality?: string;
            layoutPipelineShadow?: LayoutPipelineShadow | null;
          }>;
          parseOutcome?: string;
          checksumPassRatio?: number;
          institutionProfileGate?: {
            step1Required?: boolean;
            productionReady?: boolean;
            profileStatus?: string;
            layoutDiscoveryStatus?: string;
            layoutMapped?: boolean;
            codeProfileId?: string;
            bankName?: string | null;
          };
          layoutDiscoveryByFile?: Array<{
            fileName?: string;
            hasDocumentMap?: boolean;
            layoutDiscovery?: MonthlyStatementSummary["layoutDiscovery"];
          }>;
        };
      };
      layoutDiscovery?: MonthlyStatementSummary["layoutDiscovery"];
      analysisTitle?: string;
      analyzedAt?: string | null;
      monthsAnalyzedLabel?: string;
      transactionDataSource?: "collection" | "rollup" | "none";
      uploadDate?: string | null;
      processedDate?: string | null;
      monthlyStatementSummaries?: MonthlyStatementSummary[];
      transactions?: Array<{
        date?: string | Date;
        amount?: number;
        type?: string;
        description?: string;
        category?: string;
        isNsf?: boolean;
      }>;
      alerts?: Array<{ code?: string; message?: string; severity?: string }>;
    };
    transactions?: Array<{
      date?: string | Date;
      amount?: number;
      type?: string;
      description?: string;
      category?: string;
      isNsf?: boolean;
    }>;
  };
};

export type ChartRow = {
  label: string;
  monthKey: string;
  deposits: number;
  withdrawals: number;
  net?: number;
  adb: number | null;
  balance?: number | null;
  txnCount?: number;
  estimated?: boolean;
};

export type ParseIntegrity = {
  checksumPassRate: number | null;
  trustedForMetrics: boolean;
  degraded: boolean;
  failureCount: number;
  totalStatements: number;
};

export type MonthOption = {
  monthKey: string;
  label: string;
  fileName: string;
};

export type DashboardMeta = {
  companyName: string;
  bankName: string;
  accountNumber: string;
  requestedLoanAmount: number | null;
  l3mAverageAdb: number | null;
  analysisTitle: string;
  analyzedAt: string | null;
  monthsAnalyzedLabel: string;
  displayTitle: string;
};

const MONTH_NAMES = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

export function formatCurrency(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

/** Prefer universal reconciliation checksum over macro parseQuality flag. */
export function effectiveChecksumOk(summary: {
  checksumOk?: boolean;
  reconciliation?: ReconciliationBreakdown | null;
}): boolean {
  if (summary.reconciliation?.checksumOk != null) {
    return Boolean(summary.reconciliation.checksumOk);
  }
  return summary.checksumOk === true;
}

export function formatAnalyzedAt(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function periodStartFromSummary(summary: MonthlyStatementSummary): string | null {
  const cp = summary.coveragePeriod;
  if (cp?.startDate) return String(cp.startDate).slice(0, 10);
  const fn = String(summary.fileName || "");
  const match = fn.match(/\b(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)\b/i);
  if (match) {
    const yearMatch = fn.match(/\b(20\d{2})\b/);
    const year = yearMatch ? yearMatch[1] : "2024";
    const idx = MONTH_NAMES.findIndex(
      (x) => x.toUpperCase() === match[1].toUpperCase()
    );
    if (idx >= 0) return `${year}-${String(idx + 1).padStart(2, "0")}-01`;
  }
  return null;
}

/** Human-readable statement period for tables (e.g. "Dec 2023"). */
export function statementPeriodLabel(summary: MonthlyStatementSummary): string {
  const start = periodStartFromSummary(summary);
  if (!start || !/^\d{4}-\d{2}/.test(start)) {
    return summary.fileName || "Statement";
  }
  const [y, mo] = start.split("-");
  const idx = Number(mo) - 1;
  if (idx < 0 || idx > 11) return summary.fileName || "Statement";
  return `${MONTH_NAMES[idx]} ${y}`;
}

export function buildDisplayTitle(title: string): string {
  const t = title.trim();
  if (!t) return "Analysis";
  if (/\banalysis\b/i.test(t)) return t;
  return `${t} Analysis`;
}

/** Quality label for per-statement table — surfaces macro vs universal divergence. */
export function parseQualityLabel(summary: MonthlyStatementSummary): string {
  const universalOk = summary.reconciliation?.checksumOk;
  const macroFailed = summary.parseQuality === "FAILED_CHECKSUM";

  if (universalOk === true) {
    if (macroFailed) {
      return summary.reconciliation?.sectionReconciled === false
        ? "Section mismatch"
        : "OK (printed)";
    }
    return summary.parseQuality === "OK" ? "OK" : summary.parseQuality || "OK";
  }

  if (effectiveChecksumOk(summary)) {
    return summary.parseQuality || "OK";
  }

  return summary.parseQuality || "Review";
}

function resolveAnalyzedAt(statement: HeliosStatementPayload["data"]["statement"]): string | null {
  const analysis = statement?.analysis as
    | { processing?: { completedAt?: string } }
    | undefined;
  return (
    statement?.analyzedAt ??
    analysis?.processing?.completedAt ??
    statement?.processedDate ??
    statement?.uploadDate ??
    null
  );
}

function resolveAnalysisTitle(statement: HeliosStatementPayload["data"]["statement"]): string {
  return (
    statement?.analysisTitle ||
    statement?.applicationContext?.companyName ||
    statement?.bankName ||
    "Unknown applicant"
  );
}

/** Resolve document map / context archive from layoutDiscovery or legacy analysis fields. */
export function resolveDocumentProvenance(payload: HeliosStatementPayload) {
  const stmt = payload.data?.statement;
  const analysis = stmt?.analysis;
  const fromMonthly = stmt?.monthlyStatementSummaries?.find(
    (m) => m.layoutDiscovery?.documentMap
  )?.layoutDiscovery;
  const fromByFile = analysis?.metadata?.layoutDiscoveryByFile?.find(
    (f) => f.layoutDiscovery?.documentMap
  )?.layoutDiscovery;

  const documentMap =
    analysis?.documentMap ??
    stmt?.layoutDiscovery?.documentMap ??
    fromMonthly?.documentMap ??
    fromByFile?.documentMap ??
    null;

  const contextArchive =
    analysis?.contextArchive ??
    stmt?.layoutDiscovery?.contextArchive ??
    fromMonthly?.contextArchive ??
    fromByFile?.contextArchive ??
    null;

  return {
    documentMap,
    contextArchive,
    layoutDiscoveryStatus:
      analysis?.metadata?.institutionProfileGate?.layoutDiscoveryStatus ?? null,
    hasDocumentMap: Boolean(documentMap?.regions && Object.keys(documentMap.regions).length > 0),
  };
}

function monthKeyFromSummary(summary: MonthlyStatementSummary): string | null {
  const start = summary.coveragePeriod?.startDate;
  if (!start || start.length < 7) return null;
  return start.slice(0, 7);
}

export function formatMonthLabel(monthKey: string, fallback?: string): string {
  const match = /^(\d{4})-(\d{2})$/.exec(monthKey);
  if (!match) return fallback || monthKey;
  const year = match[1].slice(2);
  const monthIdx = Number(match[2]) - 1;
  if (monthIdx < 0 || monthIdx > 11) return fallback || monthKey;
  return `${MONTH_NAMES[monthIdx]} '${year}`;
}

function toQuarterKey(monthKey: string): string {
  const match = /^(\d{4})-(\d{2})$/.exec(monthKey);
  if (!match) return monthKey;
  const year = match[1];
  const month = Number(match[2]);
  const quarter = Math.ceil(month / 3);
  return `${year}-Q${quarter}`;
}

function formatQuarterLabel(quarterKey: string): string {
  const match = /^(\d{4})-Q(\d)$/.exec(quarterKey);
  if (!match) return quarterKey;
  return `Q${match[2]} ${match[1]}`;
}

/**
 * Build canonical monthly rows from summaries + ADB join (avoids forensic zero bleed).
 */
export function buildBaseMonthlyRows(payload: HeliosStatementPayload): ChartRow[] {
  const statement = payload.data?.statement;
  const summaries = statement?.monthlyStatementSummaries ?? [];
  const adbByMonth = statement?.analysis?.underwritingVitals?.adb?.byMonth ?? [];
  const adbMap = new Map(adbByMonth.map((m) => [m.month, m.adb]));

  if (summaries.length > 0) {
    return summaries
      .map((summary) => {
        const monthKey = monthKeyFromSummary(summary) ?? summary.fileName;
        return {
          label: formatMonthLabel(monthKey, summary.fileName),
          monthKey,
          deposits: Number(summary.totalDeposits) || 0,
          withdrawals: Number(summary.totalWithdrawals) || 0,
          net:
            (Number(summary.totalDeposits) || 0) - (Number(summary.totalWithdrawals) || 0),
          adb: adbMap.has(monthKey) ? (adbMap.get(monthKey) ?? null) : null,
        };
      })
      .sort((a, b) => a.monthKey.localeCompare(b.monthKey));
  }

  const forensic =
    statement?.analysis?.forensicIntelligence?.window?.monthlyBreakdown ?? [];
  return forensic
    .map((m) => {
      const monthKey = m.key || m.label || "unknown";
      return {
        label: m.label || formatMonthLabel(monthKey),
        monthKey,
        deposits: Number(m.deposits) || 0,
        withdrawals: Number(m.withdrawals) || 0,
        net: (Number(m.deposits) || 0) - (Number(m.withdrawals) || 0),
        adb: adbMap.has(monthKey) ? (adbMap.get(monthKey) ?? null) : null,
      };
    })
    .sort((a, b) => a.monthKey.localeCompare(b.monthKey));
}

export function getMonthOptions(payload: HeliosStatementPayload): MonthOption[] {
  const statement = payload.data?.statement;
  const summaries = statement?.monthlyStatementSummaries ?? [];

  return summaries
    .map((summary) => {
      const monthKey = monthKeyFromSummary(summary) ?? summary.fileName;
      return {
        monthKey,
        label: `${formatMonthLabel(monthKey, summary.fileName)} (${summary.fileName})`,
        fileName: summary.fileName,
      };
    })
    .sort((a, b) => a.monthKey.localeCompare(b.monthKey));
}

function aggregateQuarterly(rows: ChartRow[]): ChartRow[] {
  const buckets = new Map<
    string,
    { deposits: number; withdrawals: number; adbValues: number[] }
  >();

  for (const row of rows) {
    const qk = toQuarterKey(row.monthKey);
    const bucket = buckets.get(qk) ?? {
      deposits: 0,
      withdrawals: 0,
      adbValues: [],
    };
    bucket.deposits += row.deposits;
    bucket.withdrawals += row.withdrawals;
    if (row.adb != null && Number.isFinite(row.adb)) {
      bucket.adbValues.push(row.adb);
    }
    buckets.set(qk, bucket);
  }

  return Array.from(buckets.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([quarterKey, bucket]) => ({
      label: formatQuarterLabel(quarterKey),
      monthKey: quarterKey,
      deposits: bucket.deposits,
      withdrawals: bucket.withdrawals,
      net: bucket.deposits - bucket.withdrawals,
      adb:
        bucket.adbValues.length > 0
          ? bucket.adbValues.reduce((s, v) => s + v, 0) / bucket.adbValues.length
          : null,
    }));
}

/**
 * Pick default chart horizon from statement coverage.
 */
export function resolveDefaultHorizon(payload: HeliosStatementPayload): Horizon {
  const summaries = payload.data?.statement?.monthlyStatementSummaries ?? [];
  const count = summaries.length;
  if (count <= 0) return "l3m";
  if (count <= 2) return "monthly";
  if (count === 3) return "l3m";

  const monthKeys = summaries
    .map((s) => monthKeyFromSummary(s))
    .filter((k): k is string => Boolean(k));
  const quarters = new Set(monthKeys.map((mk) => toQuarterKey(mk)));
  if (count >= 4 || quarters.size >= 2) return "quarterly";
  return "l3m";
}

export function getSpendingWindowSummary(payload: HeliosStatementPayload) {
  const chartActivity = getChartActivityFromPayload(payload);
  return chartActivity?.windows?.l3m ?? null;
}

/**
 * Build chart rows for the selected horizon.
 */
export function buildChartRows(
  payload: HeliosStatementPayload,
  horizon: Horizon,
  selectedMonthKey?: string | null
): ChartRow[] {
  const transactions = getTransactionsFromPayload(payload);
  const summaries = payload.data?.statement?.monthlyStatementSummaries ?? [];
  const opening = getOpeningBalanceFromSummaries(summaries);
  const chartActivity = getChartActivityFromPayload(payload);

  if (horizon === "daily") {
    let daily =
      transactions.length > 0
        ? bucketByDay(transactions, opening)
        : rollupDailyToActivityRows(chartActivity?.daily ?? []);
    if (selectedMonthKey) daily = filterDailyByMonth(daily, selectedMonthKey);
    return daily.map((d) => ({
      label: d.label,
      monthKey: d.date,
      deposits: d.deposits,
      withdrawals: d.withdrawals,
      net: d.net,
      adb: null,
      balance: d.balance,
      txnCount: d.txnCount,
    }));
  }

  if (horizon === "weekly") {
    const weekly =
      transactions.length > 0
        ? bucketByWeek(transactions, opening)
        : rollupWeeklyToActivityRows(chartActivity?.weekly ?? []);
    return weekly.map((w) => ({
      label: w.label,
      monthKey: w.weekKey,
      deposits: w.deposits,
      withdrawals: w.withdrawals,
      net: w.net,
      adb: null,
      balance: w.balance,
      txnCount: w.txnCount,
    }));
  }

  const base = buildBaseMonthlyRows(payload);
  if (!base.length) return [];

  if (horizon === "monthly") {
    return base;
  }

  if (horizon === "single") {
    const key = selectedMonthKey || base[base.length - 1]?.monthKey;
    const row = base.find((r) => r.monthKey === key) ?? base[base.length - 1];
    return row ? [row] : [];
  }

  if (horizon === "l3m") {
    const l3mMonthKeys = resolveL3mMonthKeys(payload);
    let daily =
      transactions.length > 0
        ? bucketByDay(transactions, opening)
        : rollupDailyToActivityRows(chartActivity?.daily ?? []);
    daily = filterDailyByL3mMonths(daily, l3mMonthKeys);
    return daily.map((d) => ({
      label: d.label,
      monthKey: d.date,
      deposits: d.deposits,
      withdrawals: d.withdrawals,
      net: d.net,
      adb: null,
      balance: d.balance,
      txnCount: d.txnCount,
    }));
  }

  return aggregateQuarterly(base);
}

export function hasTransactionLevelData(payload: HeliosStatementPayload): boolean {
  if (getTransactionsFromPayload(payload).length > 0) return true;
  return hasChartActivityData(payload);
}

export function usesRollupOnlyTransactions(payload: HeliosStatementPayload): boolean {
  return (
    getTransactionsFromPayload(payload).length === 0 && hasChartActivityData(payload)
  );
}

const METRICS_TRUST_MIN_CHECKSUM_RATE = 1;
const ADB_CLOSING_MULTIPLIER_CAP = 10;

function isAbsurdAdb(adb: number | null, closingBalance: number | null): boolean {
  if (adb == null || !Number.isFinite(adb) || adb <= 0) return false;
  if (adb > 5_000_000) return true;
  if (closingBalance != null && closingBalance > 0 && adb > closingBalance * ADB_CLOSING_MULTIPLIER_CAP) {
    return true;
  }
  return false;
}

/**
 * Whether parse output is trustworthy enough for headline underwriting metrics.
 */
export function parseIntegrity(payload: HeliosStatementPayload): ParseIntegrity {
  const statement = payload.data?.statement;
  const summaries = statement?.monthlyStatementSummaries ?? [];
  const parseMeta = statement?.analysis?.metadata?.parseQualityByFile as
    | Array<{ checksumOk?: boolean }>
    | undefined;

  const rows =
    summaries.length > 0
      ? summaries
      : (parseMeta ?? []).map((r) => ({ checksumOk: r.checksumOk }));

  const totalStatements = rows.length;
  if (totalStatements === 0) {
    return {
      checksumPassRate: null,
      trustedForMetrics: hasTransactionLevelData(payload),
      degraded: !hasTransactionLevelData(payload),
      failureCount: 0,
      totalStatements: 0,
    };
  }

  const okCount = rows.filter((s) => effectiveChecksumOk(s)).length;
  const checksumPassRate = okCount / totalStatements;
  const closing = numClosingBalance(statement);
  const l3mAdb = statement?.analysis?.underwritingVitals?.adb?.l3mAverage ?? null;
  const absurdVitals = isAbsurdAdb(
    typeof l3mAdb === "number" ? l3mAdb : null,
    closing
  );

  const analysisMeta = statement?.analysis?.metadata as
    | {
        parseOutcome?: string;
        institutionProfileGate?: { productionReady?: boolean };
      }
    | undefined;
  const parseDegraded = analysisMeta?.parseOutcome === "DEGRADED";
  const profileNotProductionReady =
    analysisMeta?.institutionProfileGate?.productionReady === false;

  const trustedForMetrics =
    checksumPassRate >= METRICS_TRUST_MIN_CHECKSUM_RATE &&
    !absurdVitals &&
    !parseDegraded &&
    !profileNotProductionReady &&
    hasTransactionLevelData(payload);

  return {
    checksumPassRate,
    trustedForMetrics,
    degraded: !trustedForMetrics,
    failureCount: totalStatements - okCount,
    totalStatements,
  };
}

function numClosingBalance(statement: HeliosStatementPayload["data"]["statement"]): number | null {
  const n = Number(statement?.closingBalance);
  return Number.isFinite(n) ? n : null;
}

export function chartUsesEstimatedData(
  payload: HeliosStatementPayload,
  horizon: Horizon
): boolean {
  const integrity = parseIntegrity(payload);
  if (!integrity.trustedForMetrics) return true;
  if (horizon === "daily" || horizon === "weekly" || horizon === "l3m") {
    return !hasTransactionLevelData(payload);
  }
  return false;
}

export function extractDashboardMeta(payload: HeliosStatementPayload): DashboardMeta {
  const statement = payload.data?.statement;
  const analysisTitle = resolveAnalysisTitle(statement);
  return {
    companyName:
      statement?.applicationContext?.companyName ||
      statement?.bankName ||
      "Unknown applicant",
    bankName: statement?.bankName || "—",
    accountNumber: statement?.accountNumber || "—",
    requestedLoanAmount:
      statement?.applicationContext?.requestedLoanAmount ?? null,
    l3mAverageAdb:
      statement?.analysis?.underwritingVitals?.adb?.l3mAverage ?? null,
    analysisTitle,
    analyzedAt: resolveAnalyzedAt(statement),
    monthsAnalyzedLabel: statement?.monthsAnalyzedLabel ?? "",
    displayTitle: buildDisplayTitle(analysisTitle),
  };
}

export function getChecksumFailures(
  payload: HeliosStatementPayload
): MonthlyStatementSummary[] {
  const summaries = payload.data?.statement?.monthlyStatementSummaries ?? [];
  return summaries.filter((s) => !effectiveChecksumOk(s));
}

/**
 * Flatten per-file printed-vs-parsed section deltas (deposits/withdrawals/checks/
 * fees/...) so a failed checksum shows exactly which line diverged.
 */
export function getReconciliationLineDeltas(
  payload: HeliosStatementPayload
): ReconciliationLineRow[] {
  const summaries = payload.data?.statement?.monthlyStatementSummaries ?? [];
  const rows: ReconciliationLineRow[] = [];
  for (const summary of summaries) {
    const deltas = summary.reconciliation?.lineDeltas;
    if (!deltas) continue;
    for (const [key, d] of Object.entries(deltas)) {
      rows.push({
        fileName: summary.fileName,
        key,
        printed: d.printed,
        parsed: d.parsed,
        delta: d.delta,
        role: d.role,
        match: d.match,
      });
    }
  }
  return rows;
}

export function getLayoutShadowEntries(payload: HeliosStatementPayload): Array<{
  fileName: string;
  shadow: LayoutPipelineShadow;
}> {
  const statement = payload.data?.statement;
  const fromSummaries = (statement?.monthlyStatementSummaries ?? [])
    .filter((s) => s.layoutPipelineShadow)
    .map((s) => ({
      fileName: s.fileName,
      shadow: s.layoutPipelineShadow as LayoutPipelineShadow,
    }));

  if (fromSummaries.length > 0) return fromSummaries;

  const fromMeta = statement?.analysis?.metadata?.parseQualityByFile ?? [];
  return fromMeta
    .filter((row) => row.layoutPipelineShadow)
    .map((row) => ({
      fileName: row.fileName || "statement",
      shadow: row.layoutPipelineShadow as LayoutPipelineShadow,
    }));
}
