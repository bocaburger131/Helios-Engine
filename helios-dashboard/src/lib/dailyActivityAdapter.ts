/**
 * Transaction-level daily/weekly activity buckets for charts.
 */

export type HeliosTransaction = {
  _id?: string;
  id?: string;
  /** Stable UI key when Mongo id is absent */
  _clientKey?: string;
  date?: string | Date;
  amount?: number;
  type?: string;
  description?: string;
  /** Raw PDF / ledger description alias */
  originalDescription?: string;
  category?: string;
  subcategory?: string;
  taxDeductible?: "deductible" | "non_deductible" | "unknown" | string;
  categorizationSource?: "auto_ai" | "analyst_override" | string;
  isNsf?: boolean;
  isNSF?: boolean;
  balance?: number;
};

export type DailyActivityRow = {
  date: string;
  label: string;
  deposits: number;
  withdrawals: number;
  net: number;
  txnCount: number;
  balance: number | null;
};

export type WeeklyActivityRow = DailyActivityRow & { weekKey: string };

function toDateKey(d: string | Date): string | null {
  if (!d) return null;
  if (typeof d === "string") {
    const m = /^(\d{4}-\d{2}-\d{2})/.exec(d);
    if (m) return m[1];
    const parsed = new Date(d);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString().slice(0, 10);
    }
    return null;
  }
  if (d instanceof Date && !Number.isNaN(d.getTime())) {
    return d.toISOString().slice(0, 10);
  }
  return null;
}

function formatDayLabel(dateKey: string): string {
  const d = new Date(`${dateKey}T12:00:00`);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function isDeposit(txn: HeliosTransaction): boolean {
  const t = String(txn.type || "").toLowerCase();
  if (t.includes("deposit") || t.includes("credit") || t === "in") return true;
  if (t.includes("withdraw") || t.includes("debit") || t === "out") return false;
  const amt = Number(txn.amount);
  return Number.isFinite(amt) && amt >= 0;
}

function txnAmount(txn: HeliosTransaction): number {
  return Math.abs(Number(txn.amount) || 0);
}

export function bucketByDay(
  transactions: HeliosTransaction[],
  openingBalance = 0
): DailyActivityRow[] {
  const byDay = new Map<
    string,
    { deposits: number; withdrawals: number; txnCount: number }
  >();

  for (const txn of transactions) {
    const key = toDateKey(txn.date ?? "");
    if (!key) continue;
    const bucket = byDay.get(key) ?? { deposits: 0, withdrawals: 0, txnCount: 0 };
    const amt = txnAmount(txn);
    if (isDeposit(txn)) bucket.deposits += amt;
    else bucket.withdrawals += amt;
    bucket.txnCount += 1;
    byDay.set(key, bucket);
  }

  const sortedKeys = Array.from(byDay.keys()).sort();
  let running = Number(openingBalance) || 0;
  const rows: DailyActivityRow[] = [];

  for (const date of sortedKeys) {
    const b = byDay.get(date)!;
    const net = b.deposits - b.withdrawals;
    running += net;
    rows.push({
      date,
      label: formatDayLabel(date),
      deposits: b.deposits,
      withdrawals: b.withdrawals,
      net,
      txnCount: b.txnCount,
      balance: running,
    });
  }

  return rows;
}

function isoWeekKey(dateKey: string): string {
  const d = new Date(`${dateKey}T12:00:00`);
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

export function bucketByWeek(
  transactions: HeliosTransaction[],
  openingBalance = 0
): WeeklyActivityRow[] {
  const daily = bucketByDay(transactions, openingBalance);
  const byWeek = new Map<
    string,
    {
      deposits: number;
      withdrawals: number;
      net: number;
      txnCount: number;
      lastDate: string;
      balance: number | null;
    }
  >();

  for (const row of daily) {
    const wk = isoWeekKey(row.date);
    const bucket = byWeek.get(wk) ?? {
      deposits: 0,
      withdrawals: 0,
      net: 0,
      txnCount: 0,
      lastDate: row.date,
      balance: row.balance,
    };
    bucket.deposits += row.deposits;
    bucket.withdrawals += row.withdrawals;
    bucket.net += row.net;
    bucket.txnCount += row.txnCount;
    if (row.date >= bucket.lastDate) {
      bucket.lastDate = row.date;
      bucket.balance = row.balance;
    }
    byWeek.set(wk, bucket);
  }

  return Array.from(byWeek.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([weekKey, b]) => ({
      weekKey,
      date: b.lastDate,
      label: weekKey.replace("-W", " W"),
      deposits: b.deposits,
      withdrawals: b.withdrawals,
      net: b.net,
      txnCount: b.txnCount,
      balance: b.balance,
    }));
}

export function filterDailyByMonth(
  rows: DailyActivityRow[],
  monthKey: string
): DailyActivityRow[] {
  return rows.filter((r) => r.date.startsWith(monthKey));
}

export function getOpeningBalanceFromSummaries(
  summaries: Array<{ openingBalance?: number }> | undefined
): number {
  if (!summaries?.length) return 0;
  const first = summaries.find((s) => s.openingBalance != null);
  return Number(first?.openingBalance) || 0;
}

export function getTransactionsFromPayload(payload: {
  data?: {
    transactions?: HeliosTransaction[];
    statement?: { transactions?: HeliosTransaction[] };
  };
}): HeliosTransaction[] {
  const outer = payload.data?.transactions ?? [];
  const inner = payload.data?.statement?.transactions ?? [];
  return outer.length > 0 ? outer : inner;
}
