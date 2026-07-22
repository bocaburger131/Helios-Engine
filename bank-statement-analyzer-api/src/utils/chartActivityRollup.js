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



function monthKeyFromRow(row) {

  if (row.monthKey) return row.monthKey;

  const start = row.coveragePeriod?.startDate;

  if (start && start.length >= 7) return start.slice(0, 7);

  return null;

}



function resolveL3mMonthKeysFromMonthly(monthlyRows = []) {

  const keys = [...new Set(monthlyRows.map(monthKeyFromRow).filter(Boolean))].sort();

  return keys.slice(-3);

}



function calendarDaysInclusive(startDate, endDate) {

  if (!startDate || !endDate) return null;

  const start = new Date(`${String(startDate).slice(0, 10)}T12:00:00`);

  const end = new Date(`${String(endDate).slice(0, 10)}T12:00:00`);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;

  return Math.floor((end.getTime() - start.getTime()) / 86400000) + 1;

}



function resolveL3mDateRange(monthlyRows, monthKeys) {

  const set = new Set(monthKeys);

  let minStart = null;

  let maxEnd = null;



  for (const row of monthlyRows) {

    const key = monthKeyFromRow(row);

    if (!key || !set.has(key)) continue;

    const start = row.coveragePeriod?.startDate;

    const end = row.coveragePeriod?.endDate || start;

    if (start && (!minStart || start < minStart)) minStart = start;

    if (end && (!maxEnd || end > maxEnd)) maxEnd = end;

  }



  if (!minStart || !maxEnd) return null;

  return { startDate: minStart, endDate: maxEnd };

}



function withinTolerance(chartVal, summaryVal) {

  const delta = Math.abs(chartVal - summaryVal);

  return delta <= Math.max(1, 0.001 * Math.max(Math.abs(chartVal), Math.abs(summaryVal), 1));

}



function buildReconciliation(rows, monthlyRows, monthKeys) {

  if (!Array.isArray(monthlyRows) || monthlyRows.length === 0 || !monthKeys?.length) {

    return null;

  }



  const set = new Set(monthKeys);

  const matched = monthlyRows.filter((m) => set.has(monthKeyFromRow(m)));

  if (matched.length === 0) return null;



  const summaryDeposits = matched.reduce((s, m) => s + (Number(m.totalDeposits) || 0), 0);

  const summaryWithdrawals = matched.reduce((s, m) => s + (Number(m.totalWithdrawals) || 0), 0);

  const chartDeposits = rows.reduce((s, r) => s + r.deposits, 0);

  const chartWithdrawals = rows.reduce((s, r) => s + r.withdrawals, 0);

  const deltaDeposits = round2(chartDeposits - summaryDeposits);

  const deltaWithdrawals = round2(chartWithdrawals - summaryWithdrawals);



  return {

    chartTotalDeposits: round2(chartDeposits),

    chartTotalWithdrawals: round2(chartWithdrawals),

    summaryTotalDeposits: round2(summaryDeposits),

    summaryTotalWithdrawals: round2(summaryWithdrawals),

    deltaDeposits,

    deltaWithdrawals,

    withinTolerance:

      withinTolerance(chartDeposits, summaryDeposits) &&

      withinTolerance(chartWithdrawals, summaryWithdrawals)

  };

}



function buildWindowSummary(daily, monthKeys = null, monthlyRows = []) {

  let rows = daily;

  let resolvedMonthKeys = monthKeys;



  if (Array.isArray(monthKeys) && monthKeys.length > 0) {

    const set = new Set(monthKeys);

    rows = daily.filter((d) => set.has(d.date.slice(0, 7)));

  } else if (monthKeys === 'l3m') {

    if (monthlyRows.length > 0) {

      resolvedMonthKeys = resolveL3mMonthKeysFromMonthly(monthlyRows);

      const set = new Set(resolvedMonthKeys);

      rows = daily.filter((d) => set.has(d.date.slice(0, 7)));

    } else {

      const keys = [...new Set(daily.map((d) => d.date.slice(0, 7)))].sort();

      resolvedMonthKeys = keys.slice(-3);

      const last3 = new Set(resolvedMonthKeys);

      rows = daily.filter((d) => last3.has(d.date.slice(0, 7)));

    }

  }



  if (rows.length === 0) {

    return null;

  }



  const deposits = rows.reduce((s, r) => s + r.deposits, 0);

  const withdrawals = rows.reduce((s, r) => s + r.withdrawals, 0);

  const txnCount = rows.reduce((s, r) => s + (r.txnCount || 0), 0);

  const txnActiveDays = rows.length;

  const net = deposits - withdrawals;



  const dateRange =

    Array.isArray(resolvedMonthKeys) && resolvedMonthKeys.length > 0

      ? resolveL3mDateRange(monthlyRows, resolvedMonthKeys)

      : null;



  const calendarDays =

    (dateRange && calendarDaysInclusive(dateRange.startDate, dateRange.endDate)) ||

    txnActiveDays;



  const denominator = calendarDays > 0 ? calendarDays : txnActiveDays;



  const adbMonths =

    Array.isArray(resolvedMonthKeys) && resolvedMonthKeys.length > 0

      ? monthlyRows.filter((m) => resolvedMonthKeys.includes(monthKeyFromRow(m)))

      : [];

  const adb =

    adbMonths.length > 0

      ? adbMonths.reduce((s, m) => s + (Number(m.adb) || 0), 0) / adbMonths.length

      : null;



  return {

    deposits: round2(deposits),

    withdrawals: round2(withdrawals),

    net: round2(net),

    avgDailyDeposits: round2(deposits / denominator),

    avgDailyWithdrawals: round2(withdrawals / denominator),

    avgTxnPerDay: round2(txnCount / denominator),

    txnCount,

    daysInWindow: txnActiveDays,

    calendarDays,

    monthKeys: [...new Set(rows.map((r) => r.date.slice(0, 7)))].sort(),

    dateRange,

    reconciliation: buildReconciliation(rows, monthlyRows, resolvedMonthKeys),

    adb: adb != null ? round2(adb) : null

  };

}



function buildQuarterlyWindows(daily, monthlyRows = []) {

  const byQuarter = new Map();

  for (const row of daily) {

    const d = new Date(`${row.date}T12:00:00`);

    const q = Math.ceil((d.getUTCMonth() + 1) / 3);

    const qk = `${d.getUTCFullYear()}-Q${q}`;

    const bucket = byQuarter.get(qk) ?? { dailyRows: [] };

    bucket.dailyRows.push(row);

    byQuarter.set(qk, bucket);

  }



  return Array.from(byQuarter.entries())

    .sort(([a], [b]) => a.localeCompare(b))

    .map(([quarterKey, bucket]) => {

      const summary = buildWindowSummary(bucket.dailyRows);

      const adbMonths = monthlyRows.filter((m) => toQuarterKeyFromMonth(monthKeyFromRow(m)) === quarterKey);

      const adb =

        adbMonths.length > 0

          ? adbMonths.reduce((s, m) => s + (Number(m.adb) || 0), 0) / adbMonths.length

          : null;

      return summary ? { quarterKey, ...summary, adb: adb != null ? round2(adb) : null } : null;

    })

    .filter(Boolean);

}



function toQuarterKeyFromMonth(monthKey) {

  const m = /^(\d{4})-(\d{2})$/.exec(monthKey);

  if (!m) return monthKey;

  const quarter = Math.ceil(Number(m[2]) / 3);

  return `${m[1]}-Q${quarter}`;

}



function normalizeMonthlyRows(monthlyRows = []) {

  return monthlyRows

    .map((row) => ({

      monthKey: monthKeyFromRow(row),

      totalDeposits: Number(row.totalDeposits) || 0,

      totalWithdrawals: Number(row.totalWithdrawals) || 0,

      coveragePeriod: row.coveragePeriod || null,

      adb: row.adb != null ? Number(row.adb) : null

    }))

    .filter((row) => row.monthKey);

}



/**

 * @param {Array<object>} transactions

 * @param {number} [openingBalance]

 * @param {Array<{ monthKey?: string, totalDeposits?: number, totalWithdrawals?: number, coveragePeriod?: object, adb?: number }>} [monthlyRows]

 */

export function buildChartActivityRollup(transactions, openingBalance = 0, monthlyRows = []) {

  const txns = Array.isArray(transactions) ? transactions : [];

  const daily = bucketByDay(txns, openingBalance);

  const weekly = bucketByWeek(daily);

  const normalizedMonthly = normalizeMonthlyRows(monthlyRows);

  const l3mMonthKeys = resolveL3mMonthKeysFromMonthly(normalizedMonthly);



  const l3m = buildWindowSummary(

    daily,

    l3mMonthKeys.length > 0 ? l3mMonthKeys : 'l3m',

    normalizedMonthly

  );

  const quarterly = buildQuarterlyWindows(daily, normalizedMonthly);



  return {

    version: 1,

    openingBalance: round2(openingBalance),

    daily,

    weekly,

    windows: {

      l3m,

      quarterly

    },

    sourceTxnCount: txns.length,

    computedAt: new Date().toISOString()

  };

}



export default { buildChartActivityRollup };

