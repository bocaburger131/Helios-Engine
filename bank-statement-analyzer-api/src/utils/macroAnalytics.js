/**
 * Deterministic underwriting vitals from a clean transaction ledger.
 * @license Copyright (c) 2025 Shift 4 Financial INC
 */

import { isLikelyInternalTransfer } from './forensicIntelligence.js';
import { isLedgerInflow, isLedgerOutflow } from './transactionNormalization.js';

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

const NSF_KEYWORDS = [
  'nsf',
  'insufficient funds',
  'insufficient',
  'returned item',
  'returned check',
  'returned deposit',
  'non-sufficient',
  'bounce',
  'dishonored',
  'refer to maker'
];

const OVERDRAFT_KEYWORDS = ['overdraft', 'overdraw', 'od fee', 'od charge'];

const MCA_KEYWORDS = [
  'mca',
  'merchant cash',
  'merchant advance',
  'ondeck',
  'can capital',
  'yellowstone',
  'kabbage',
  'credibly',
  'rapid finance',
  'forward financing',
  'biz2credit',
  'fundbox',
  'funding',
  'daily ach',
  'weekly ach'
];

const NON_REVENUE_KEYWORDS = [
  'zelle',
  'venmo',
  'cash app',
  'paypal transfer',
  'internal transfer',
  'transfer from',
  'loan proceeds',
  'refund',
  'chargeback',
  'reversal',
  'owner draw',
  'capital contribution'
];

function parseTxDate(tx) {
  const d = new Date(tx?.date || tx?.transactionDate);
  return Number.isNaN(d.getTime()) ? null : d;
}

function monthKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function matchesAny(text, keywords) {
  const lower = String(text || '').toLowerCase();
  return keywords.some((k) => lower.includes(k));
}

function classifyRiskTag(description) {
  const desc = String(description || '');
  if (matchesAny(desc, OVERDRAFT_KEYWORDS)) return 'OVERDRAFT';
  if (matchesAny(desc, NSF_KEYWORDS)) return 'NSF';
  return null;
}

function isMcaLike(description, amount) {
  const desc = String(description || '');
  if (!matchesAny(desc, MCA_KEYWORDS) && !/\bach\s+(debit|pmt|payment)\b/i.test(desc)) {
    return false;
  }
  const abs = Math.abs(Number(amount));
  return Number.isFinite(abs) && abs >= 50;
}

function isNonRevenueDeposit(tx, applicationContext = {}, transferHints = {}) {
  const desc = String(tx.description || tx.memo || '');
  const amt = Number(tx.amount);
  if (!Number.isFinite(amt) || amt <= 0) return null;

  if (isLikelyInternalTransfer(tx, transferHints)) {
    return 'INTERNAL_TRANSFER';
  }
  const owner = String(applicationContext.ownerName || '').trim();
  if (owner.length >= 3 && matchesAny(desc, ['zelle', 'venmo', 'cash app'])) {
    const ownerParts = owner.toLowerCase().split(/\s+/).filter((p) => p.length > 2);
    const descLower = desc.toLowerCase();
    if (ownerParts.some((p) => descLower.includes(p))) {
      return 'OWNER_PERSONAL_TRANSFER';
    }
  }
  if (matchesAny(desc, NON_REVENUE_KEYWORDS)) {
    if (desc.toLowerCase().includes('zelle')) return 'ZELLE_TRANSFER';
    if (desc.toLowerCase().includes('venmo')) return 'VENMO_TRANSFER';
    if (desc.toLowerCase().includes('loan')) return 'LOAN_PROCEEDS';
    if (desc.toLowerCase().includes('refund') || desc.toLowerCase().includes('chargeback')) {
      return 'REFUND_OR_CHARGEBACK';
    }
    return 'NON_OPERATING_CREDIT';
  }
  return null;
}

/**
 * Build daily end-of-day balances for ADB and negative-day counts.
 * @param {Array<object>} transactions
 * @param {number} openingBalance
 */
export function buildDailyBalances(transactions, openingBalance = 0) {
  const sorted = [...(transactions || [])]
    .map((t) => ({ tx: t, d: parseTxDate(t) }))
    .filter((x) => x.d)
    .sort((a, b) => a.d - b.d);

  if (sorted.length === 0) {
    return { daily: [], periodDays: 0, negativeDayCount: 0, lowestDailyBalance: openingBalance };
  }

  const start = new Date(sorted[0].d);
  start.setHours(0, 0, 0, 0);
  const end = new Date(sorted[sorted.length - 1].d);
  end.setHours(23, 59, 59, 999);

  const txByDate = {};
  for (const { tx, d } of sorted) {
    const key = d.toISOString().slice(0, 10);
    if (!txByDate[key]) txByDate[key] = [];
    txByDate[key].push(tx);
  }

  let running = Number(openingBalance) || 0;
  let lowest = running;
  let negativeDayCount = 0;
  const daily = [];
  const cursor = new Date(start);
  let periodDays = 0;

  while (cursor <= end) {
    const key = cursor.toISOString().slice(0, 10);
    for (const tx of txByDate[key] || []) {
      const n = Number(tx.amount);
      if (Number.isFinite(n)) running += n;
    }
    lowest = Math.min(lowest, running);
    if (running < -0.01) negativeDayCount += 1;
    daily.push({ date: key, balance: round2(running) });
    periodDays += 1;
    cursor.setDate(cursor.getDate() + 1);
  }

  return { daily, periodDays, negativeDayCount, lowestDailyBalance: round2(lowest) };
}

export function computeAdbByMonth(dailyBalances, months = 3) {
  const daily = dailyBalances?.daily || [];
  if (!daily.length) {
    return { l3mAverage: 0, byMonth: [], periodDays: 0 };
  }

  const buckets = new Map();
  for (const row of daily) {
    const d = new Date(`${row.date}T12:00:00Z`);
    const mk = monthKey(d);
    if (!buckets.has(mk)) buckets.set(mk, { sum: 0, days: 0, month: mk });
    const b = buckets.get(mk);
    b.sum += row.balance;
    b.days += 1;
  }

  const sortedKeys = [...buckets.keys()].sort();
  const recentKeys = sortedKeys.slice(-months);
  const byMonth = recentKeys.map((mk) => {
    const b = buckets.get(mk);
    return {
      month: mk,
      adb: round2(b.sum / Math.max(1, b.days)),
      daysInMonth: b.days
    };
  });

  const l3mAverage =
    byMonth.length > 0
      ? round2(byMonth.reduce((s, m) => s + m.adb, 0) / byMonth.length)
      : 0;

  return {
    l3mAverage,
    byMonth,
    periodDays: dailyBalances.periodDays || daily.length
  };
}

export function flagNsfAndOverdraft(transactions) {
  const flagged = [];
  let nsfCount = 0;
  let overdraftCount = 0;

  for (const tx of transactions || []) {
    const tag = classifyRiskTag(tx.description);
    if (!tag) continue;
    if (tag === 'NSF') nsfCount += 1;
    else overdraftCount += 1;
    flagged.push({
      date: tx.date || tx.transactionDate,
      amount: round2(Number(tx.amount)),
      description: String(tx.description || '').slice(0, 120),
      riskTag: tag
    });
  }

  return { nsfCount, overdraftCount, flaggedTransactions: flagged };
}

export function detectMcaStacking(transactions) {
  const debits = (transactions || []).filter((t) => {
    const n = Number(t.amount);
    return Number.isFinite(n) && n < 0 && isMcaLike(t.description, n);
  });

  const byLender = new Map();
  for (const tx of debits) {
    const desc = String(tx.description || '').toLowerCase();
    let hint = 'ACH_DEBIT';
    for (const kw of MCA_KEYWORDS) {
      if (desc.includes(kw)) {
        hint = kw.toUpperCase().replace(/\s+/g, '_');
        break;
      }
    }
    const abs = Math.abs(Number(tx.amount));
    const cadence = abs % 100 === 0 || abs % 50 === 0 ? 'ROUND_AMOUNT' : 'VARIABLE';
    const entry = {
      date: tx.date || tx.transactionDate,
      amount: round2(Number(tx.amount)),
      description: String(tx.description || '').slice(0, 120),
      cadence,
      lenderHint: hint
    };
    if (!byLender.has(hint)) byLender.set(hint, []);
    byLender.get(hint).push(entry);
  }

  const dailyOrWeeklyDebits = debits.map((tx) => {
    const desc = String(tx.description || '').toLowerCase();
    let hint = 'ACH_DEBIT';
    for (const kw of MCA_KEYWORDS) {
      if (desc.includes(kw)) {
        hint = kw.toUpperCase().replace(/\s+/g, '_');
        break;
      }
    }
    return {
      date: tx.date || tx.transactionDate,
      amount: round2(Number(tx.amount)),
      description: String(tx.description || '').slice(0, 120),
      cadence: 'WEEKLY_OR_DAILY',
      lenderHint: hint
    };
  });

  const lenderCount = byLender.size;
  const detected = lenderCount >= 2 || debits.length >= 3;
  const totalMonthlyDebtService = round2(
    debits.reduce((s, t) => s + Math.abs(Number(t.amount)), 0) / Math.max(1, 3)
  );

  return { detected, dailyOrWeeklyDebits, totalMonthlyDebtService, lenderCount };
}

export function computeTrueRevenue(transactions, applicationContext = {}, transferHints = {}) {
  const byMonth = new Map();
  const excludedNonRevenue = [];
  let trueTotal = 0;

  for (const tx of transactions || []) {
    if (!isLedgerInflow(tx)) continue;
    const amt = Math.abs(Number(tx.amount));
    if (!Number.isFinite(amt) || amt <= 0) continue;

    const reason = isNonRevenueDeposit(tx, applicationContext, transferHints);
    if (reason) {
      excludedNonRevenue.push({
        date: tx.date || tx.transactionDate,
        amount: round2(amt),
        description: String(tx.description || '').slice(0, 120),
        exclusionReason: reason
      });
      continue;
    }

    trueTotal += amt;
    const d = parseTxDate(tx);
    if (d) {
      const mk = monthKey(d);
      byMonth.set(mk, (byMonth.get(mk) || 0) + amt);
    }
  }

  const trueMonthlyRevenue = [...byMonth.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, amount]) => ({ month, amount: round2(amount) }));

  const l3mTrueRevenueAverage =
    trueMonthlyRevenue.length > 0
      ? round2(
          trueMonthlyRevenue.slice(-3).reduce((s, m) => s + m.amount, 0) /
            Math.min(3, trueMonthlyRevenue.slice(-3).length)
        )
      : 0;

  return { trueMonthlyRevenue, excludedNonRevenue, l3mTrueRevenueAverage, trueTotal: round2(trueTotal) };
}

function buildForensicBriefing({ adb, liquidity, nsf, mca, revenue }) {
  const alerts = [];
  if (liquidity.negativeDayCount >= 3) {
    alerts.push({
      code: 'NEGATIVE_BALANCE_DAYS',
      severity: 'HIGH',
      message: `${liquidity.negativeDayCount} day(s) with negative end-of-day balance`
    });
  }
  if (nsf.nsfCount >= 2) {
    alerts.push({
      code: 'NSF_CLUSTER',
      severity: 'HIGH',
      message: `${nsf.nsfCount} NSF / returned-item event(s) in window`
    });
  }
  if (mca.detected) {
    alerts.push({
      code: 'MCA_STACKING',
      severity: 'HIGH',
      message: `Possible MCA / daily ACH stacking (${mca.lenderCount} lender pattern(s))`
    });
  }
  if (revenue.excludedNonRevenue.length >= 3) {
    alerts.push({
      code: 'NON_REVENUE_DEPOSITS',
      severity: 'MEDIUM',
      message: `${revenue.excludedNonRevenue.length} non-operating credits excluded from true revenue`
    });
  }

  const summaryMarkdown = [
    '## Underwriting Vitals',
    `- **L3M ADB:** $${adb.l3mAverage.toLocaleString()}`,
    `- **Negative days:** ${liquidity.negativeDayCount}`,
    `- **NSF / overdraft events:** ${nsf.nsfCount + nsf.overdraftCount}`,
    `- **True L3M revenue (avg/mo):** $${revenue.l3mTrueRevenueAverage.toLocaleString()}`,
    mca.detected
      ? `- **MCA stacking:** detected (~$${mca.totalMonthlyDebtService.toLocaleString()}/mo debt service proxy)`
      : '- **MCA stacking:** not detected'
  ].join('\n');

  return { summaryMarkdown, alerts };
}

/**
 * @param {object} params
 */
export function computeUnderwritingVitals({
  transactions = [],
  openingBalance = 0,
  closingBalance = null,
  months = 3,
  applicationContext = {},
  transferFilterHints = {}
} = {}) {
  const dailyBalances = buildDailyBalances(transactions, openingBalance);
  const adb = computeAdbByMonth(dailyBalances, months);
  const liquidity = {
    negativeDayCount: dailyBalances.negativeDayCount,
    lowestDailyBalance: dailyBalances.lowestDailyBalance,
    daysBelowZero: dailyBalances.negativeDayCount
  };
  const nsfAndOverdraft = flagNsfAndOverdraft(transactions);
  const mcaStacking = detectMcaStacking(transactions);
  const revenue = computeTrueRevenue(transactions, applicationContext, transferFilterHints);
  const forensicBriefing = buildForensicBriefing({
    adb,
    liquidity,
    nsf: nsfAndOverdraft,
    mca: mcaStacking,
    revenue
  });

  return {
    adb,
    liquidity,
    nsfAndOverdraft,
    mcaStacking,
    revenue,
    forensicBriefing,
    openingBalance: round2(openingBalance),
    closingBalance: closingBalance != null ? round2(closingBalance) : null,
    computedAt: new Date().toISOString()
  };
}

export default {
  computeUnderwritingVitals,
  buildDailyBalances,
  computeAdbByMonth,
  flagNsfAndOverdraft,
  detectMcaStacking,
  computeTrueRevenue
};
