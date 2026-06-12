/**
 * Maps analysis_master / GET /api/statements/:id payload to Recharts series.
 * Primary source: monthlyStatementSummaries + underwritingVitals.adb.byMonth
 */

import type { LayoutPipelineShadow } from "@/lib/apiClient";
import {
  bucketByDay,
  bucketByWeek,
  filterDailyByMonth,
  getOpeningBalanceFromSummaries,
  getTransactionsFromPayload,
} from "@/lib/dailyActivityAdapter";

export type Horizon = "daily" | "weekly" | "single" | "monthly" | "l3m" | "quarterly";

export type MonthlyStatementSummary = {
  fileName: string;
  totalDeposits?: number;
  totalWithdrawals?: number;
  openingBalance?: number;
  closingBalance?: number;
  parseQuality?: string;
  checksumOk?: boolean;
  layoutPipelineShadow?: LayoutPipelineShadow | null;
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
        underwritingVitals?: {
          adb?: {
            l3mAverage?: number;
            byMonth?: AdbByMonth[];
          };
        };
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
          parseQualityByFile?: Array<{
            fileName?: string;
            checksumOk?: boolean;
            parseQuality?: string;
            layoutPipelineShadow?: LayoutPipelineShadow | null;
          }>;
        };
      };
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
  adb: number | null;
  balance?: number | null;
  txnCount?: number;
  estimated?: boolean;
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
      adb:
        bucket.adbValues.length > 0
          ? bucket.adbValues.reduce((s, v) => s + v, 0) / bucket.adbValues.length
          : null,
    }));
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

  if (horizon === "daily") {
    let daily = bucketByDay(transactions, opening);
    if (selectedMonthKey) daily = filterDailyByMonth(daily, selectedMonthKey);
    return daily.map((d) => ({
      label: d.label,
      monthKey: d.date,
      deposits: d.deposits,
      withdrawals: d.withdrawals,
      adb: null,
      balance: d.balance,
      txnCount: d.txnCount,
    }));
  }

  if (horizon === "weekly") {
    const weekly = bucketByWeek(transactions, opening);
    return weekly.map((w) => ({
      label: w.label,
      monthKey: w.weekKey,
      deposits: w.deposits,
      withdrawals: w.withdrawals,
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
    return base.slice(-3);
  }

  return aggregateQuarterly(base);
}

export function hasTransactionLevelData(payload: HeliosStatementPayload): boolean {
  return getTransactionsFromPayload(payload).length > 0;
}

export function chartUsesEstimatedData(
  payload: HeliosStatementPayload,
  horizon: Horizon
): boolean {
  if (horizon === "daily" || horizon === "weekly") {
    return !hasTransactionLevelData(payload);
  }
  return false;
}

export function extractDashboardMeta(payload: HeliosStatementPayload): DashboardMeta {
  const statement = payload.data?.statement;
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
  };
}

export function getChecksumFailures(
  payload: HeliosStatementPayload
): MonthlyStatementSummary[] {
  const summaries = payload.data?.statement?.monthlyStatementSummaries ?? [];
  return summaries.filter((s) => s.checksumOk === false);
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
