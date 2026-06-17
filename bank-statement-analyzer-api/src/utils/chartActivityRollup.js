/**
 * Pre-aggregate daily/weekly chart buckets for dashboard drill-down.
 * Mirrors helios-dashboard dailyActivityAdapter shapes.
 */

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

function toDateKey(d) {
  if (!d) return null;
  if (typeof d === 'string') {
    const m = /^(\d{4}-\d{2}-\d{2})/.exec(d);
    if (m) return m[1];
    const parsed = new Date(d);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
    return null;
  }
  if (d instanceof Date && !Number.isNaN(d.getTime())) {
    return d.toISOString().slice(0, 10);
  }
  return null;
}

function isDeposit(txn) {
  const t = String(txn.type || '').toLowerCase();
  if (t.includes('deposit') || t.includes('credit') || t === 'in') return true;
  if (t.includes('withdraw') || t.includes('debit') || t === 'out') return false;
  const amt = Number(txn.amount);
  return Number.isFinite(amt) && amt >= 0;
}

function txnAmount(txn) {
  return Math.abs(Number(txn.amount) || 0);
}

function bucketByDay(transactions, openingBalance = 0) {
  const byDay = new Map();

  for (const txn of transactions || []) {
    const key = toDateKey(txn.date ?? txn.transactionDate);
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
  const daily = [];

  for (const date of sortedKeys) {
    const b = byDay.get(date);
    const net = b.deposits - b.withdrawals;
    running += net;
    daily.push({
      date,
      deposits: round2(b.deposits),
      withdrawals: round2(b.withdrawals),
      net: round2(net),
      txnCount: b.txnCount,
      balance: round2(running)
    });
  }

  return daily;
}

function isoWeekKey(dateKey) {
  const d = new Date(`${dateKey}T12:00:00`);
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

function bucketByWeek(daily) {
  const byWeek = new Map();

  for (const row of daily) {
    const wk = isoWeekKey(row.date);
    const bucket = byWeek.get(wk) ?? {
      deposits: 0,
      withdrawals: 0,
      net: 0,
      txnCount: 0,
      lastDate: row.date,
      balance: row.balance
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
      deposits: round2(b.deposits),
      withdrawals: round2(b.withdrawals),
      net: round2(b.net),
      txnCount: b.txnCount,
      balance: b.balance != null ? round2(b.balance) : null
    }));
}

/**
 * @param {Array<object>} transactions
 * @param {number} [openingBalance]
 */
export function buildChartActivityRollup(transactions, openingBalance = 0) {
  const txns = Array.isArray(transactions) ? transactions : [];
  const daily = bucketByDay(txns, openingBalance);
  const weekly = bucketByWeek(daily);

  return {
    version: 1,
    openingBalance: round2(openingBalance),
    daily,
    weekly,
    sourceTxnCount: txns.length,
    computedAt: new Date().toISOString()
  };
}

export default { buildChartActivityRollup };
