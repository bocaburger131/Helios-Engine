/**
 * Portfolio-level rollups for macro batch responses (thin frontend).
 */

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

export function mapExpenseBucket(category) {
  const c = String(category || '').toLowerCase();
  if (c.includes('cogs') || c.includes('equipment') || c.includes('inventory')) return 'COGS';
  if (c.includes('opex') || c.includes('operations') || c.includes('rent')) return 'OpEx';
  if (
    c.includes('high-risk') ||
    c.includes('high risk') ||
    c.includes('gambling') ||
    c.includes('cash advance') ||
    c.includes('predatory') ||
    c.includes('fraud')
  ) {
    return 'HighRisk';
  }
  return 'Other';
}

/**
 * Roll up debit/outflow transactions by LLM category and OpEx/COGS/HighRisk buckets.
 * @param {Array} transactions
 * @returns {{ buckets: Record<string, number>, byCategory: Record<string, { total: number, count: number }> }}
 */
export function rollupExpensesFromTransactions(transactions) {
  const buckets = { OpEx: 0, COGS: 0, HighRisk: 0, Other: 0 };
  const byCategory = {};

  for (const raw of transactions || []) {
    const amount = Number(raw?.amount);
    if (!Number.isFinite(amount) || amount >= 0) continue;

    const abs = Math.abs(amount);
    const category = raw.category || raw.llmCategory || 'Uncategorized';
    const bucket = mapExpenseBucket(category);

    buckets[bucket] = round2((buckets[bucket] || 0) + abs);

    if (!byCategory[category]) {
      byCategory[category] = { total: 0, count: 0 };
    }
    byCategory[category].total = round2(byCategory[category].total + abs);
    byCategory[category].count += 1;
  }

  return { buckets, byCategory };
}

export function mergeExpenseRollups(target, next) {
  if (!next) return target;
  for (const key of ['OpEx', 'COGS', 'HighRisk', 'Other']) {
    target.buckets[key] = round2((target.buckets[key] || 0) + (next.buckets[key] || 0));
  }
  for (const [cat, val] of Object.entries(next.byCategory || {})) {
    if (!target.byCategory[cat]) {
      target.byCategory[cat] = { total: 0, count: 0 };
    }
    target.byCategory[cat].total = round2(target.byCategory[cat].total + val.total);
    target.byCategory[cat].count += val.count;
  }
  return target;
}

export function buildFinancialTotals(macroAgg) {
  if (!macroAgg) {
    return {
      totalDeposits: 0,
      totalWithdrawals: 0,
      netCashFlow: 0,
      openingBalance: 0,
      closingBalance: 0,
      averageDailyBalance: 0,
      nsfCount: 0
    };
  }
  return {
    totalDeposits: round2(macroAgg.totalDeposits),
    totalWithdrawals: round2(macroAgg.totalWithdrawals),
    netCashFlow: round2(macroAgg.netCashFlow),
    openingBalance: round2(macroAgg.openingBalance),
    closingBalance: round2(macroAgg.closingBalance),
    averageDailyBalance: round2(macroAgg.averageDailyBalance),
    nsfCount: macroAgg.nsfCount || 0,
    dateRange: macroAgg.dateRange || null
  };
}

export function buildTamperingSummary(allAlerts) {
  const tampering = (allAlerts || []).filter(
    (a) => a.code === 'CRITICAL_TAMPERING_ALERT' || a.type === 'FRAUD'
  );
  return {
    count: tampering.length,
    critical: tampering.filter((a) => a.severity === 'CRITICAL').length,
    alerts: tampering.map((a) => ({
      code: a.code,
      severity: a.severity,
      message: a.message,
      data: a.data || {}
    }))
  };
}
