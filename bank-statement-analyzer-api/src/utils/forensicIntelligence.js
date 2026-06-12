const round = (n, d = 2) => {
  if (n === null || n === undefined || Number.isNaN(n) || !Number.isFinite(n)) return null;
  const f = Math.pow(10, d);
  return Math.round(n * f) / f;
};

function normLast4List(hints) {
  const raw = hints?.linkedAccountLast4s ?? hints?.accountNumbers ?? [];
  const arr = Array.isArray(raw) ? raw : [];
  const out = new Set();
  for (const a of arr) {
    const d = String(a ?? '').replace(/\D/g, '');
    if (d.length >= 4) out.add(d.slice(-4));
  }
  return [...out];
}

/**
 * Heuristic: internal transfer between two known account ends (same batch / institution).
 * @param {{ amount?: number, description?: string, memo?: string }} txn
 * @param {{ linkedAccountLast4s?: string[], accountNumbers?: string[] }} [hints]
 */
export function isLikelyInternalTransfer(txn, hints) {
  const last4s = normLast4List(hints);
  if (last4s.length < 2) return false;
  const desc = String(txn.description || txn.memo || '').toUpperCase();
  if (!/\b(TRANSFER|XFER|INTERNAL|ACCT\s*TO\s*ACCT|BTW\s+ACCOUNTS)\b/.test(desc)) {
    return false;
  }
  let hits = 0;
  for (const l4 of last4s) {
    if (l4 && desc.includes(l4)) hits += 1;
  }
  return hits >= 2;
}

function bucketByMonth(transactions, months, transferHints) {
  const txns = Array.isArray(transactions)
    ? transactions.filter((t) => t && (t.date || t.transactionDate))
    : [];
  if (txns.length === 0) {
    return {
      monthlyBreakdown: [],
      startMonth: null,
      endMonth: null,
      totalsFromTxns: false,
      excludedInternalTransferAmount: 0,
      excludedInternalTransferCount: 0
    };
  }

  const norm = txns
    .map((t) => ({
      date: new Date(t.date || t.transactionDate),
      amount: Number(t.amount) || 0,
      raw: t
    }))
    .filter((t) => !Number.isNaN(t.date.getTime()));

  let excludedAmount = 0;
  let excludedCount = 0;
  const filtered = norm.filter((t) => {
    if (t.amount > 0 && isLikelyInternalTransfer(t.raw, transferHints)) {
      excludedAmount += t.amount;
      excludedCount += 1;
      return false;
    }
    return true;
  });

  if (filtered.length === 0) {
    return {
      monthlyBreakdown: [],
      startMonth: null,
      endMonth: null,
      totalsFromTxns: false,
      excludedInternalTransferAmount: round(excludedAmount, 2),
      excludedInternalTransferCount: excludedCount
    };
  }

  filtered.sort((a, b) => a.date - b.date);
  const end = filtered[filtered.length - 1].date;
  const keys = [];
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(end);
    d.setMonth(d.getMonth() - i);
    keys.push({
      key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
      label: d.toLocaleString('en-US', { month: 'short', year: '2-digit' })
    });
  }
  const buckets = new Map(
    keys.map((k) => [
      k.key,
      { key: k.key, label: k.label, deposits: 0, withdrawals: 0, net: 0, depositCount: 0 }
    ])
  );
  for (const t of filtered) {
    const k = `${t.date.getFullYear()}-${String(t.date.getMonth() + 1).padStart(2, '0')}`;
    if (!buckets.has(k)) continue;
    const b = buckets.get(k);
    if (t.amount >= 0) {
      b.deposits += t.amount;
      b.depositCount += 1;
    } else {
      b.withdrawals += Math.abs(t.amount);
    }
  }
  const monthlyBreakdown = Array.from(buckets.values()).map((b) => ({
    ...b,
    deposits: round(b.deposits, 2),
    withdrawals: round(b.withdrawals, 2),
    net: round(b.deposits - b.withdrawals, 2),
    depositCount: b.depositCount
  }));
  return {
    monthlyBreakdown,
    startMonth: keys[0]?.key || null,
    endMonth: keys[keys.length - 1]?.key || null,
    totalsFromTxns: true,
    excludedInternalTransferAmount: round(excludedAmount, 2),
    excludedInternalTransferCount: excludedCount
  };
}

function syntheticBreakdown(financialSummary, months) {
  const totalDeposits = Number(financialSummary?.totalDeposits) || 0;
  const totalWithdrawals = Number(financialSummary?.totalWithdrawals) || 0;
  if (totalDeposits === 0 && totalWithdrawals === 0) {
    return { monthlyBreakdown: [], startMonth: null, endMonth: null, totalsFromTxns: false };
  }
  const per = round(totalDeposits / months, 2);
  const perW = round(totalWithdrawals / months, 2);
  const monthlyBreakdown = Array.from({ length: months }, (_, i) => ({
    key: `synthetic-${i}`,
    label: `M${i + 1}`,
    deposits: per,
    withdrawals: perW,
    net: round(per - perW, 2),
    depositCount: null
  }));
  return { monthlyBreakdown, startMonth: null, endMonth: null, totalsFromTxns: false };
}

function computeConsistency(breakdown) {
  if (!breakdown || breakdown.length < 2) return null;
  const vals = breakdown.map((m) => m.deposits || 0);
  const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
  if (mean <= 0) return 0;
  const variance = vals.reduce((s, v) => s + (v - mean) ** 2, 0) / vals.length;
  const stdev = Math.sqrt(variance);
  const cv = stdev / mean;
  return Math.max(0, Math.min(100, Math.round((1 - cv) * 100)));
}

function computeMomentum(breakdown) {
  if (!breakdown || breakdown.length < 2) {
    return { momGrowthRates: breakdown?.length === 1 ? [0] : [], overallTrend: 'UNKNOWN' };
  }
  const momGrowthRates = breakdown.map((m, i) => {
    if (i === 0) return 0;
    const prev = breakdown[i - 1].deposits;
    if (!prev || prev <= 0) return 0;
    return round((m.deposits - prev) / prev, 4);
  });
  const meaningful = momGrowthRates.slice(1);
  if (meaningful.length === 0) return { momGrowthRates, overallTrend: 'UNKNOWN' };
  const avg = meaningful.reduce((a, b) => a + b, 0) / meaningful.length;
  let overallTrend = 'STABLE';
  if (avg > 0.05) overallTrend = 'GROWING';
  else if (avg < -0.05) overallTrend = 'DECLINING';
  return { momGrowthRates, overallTrend };
}

/**
 * @param {{ depositCount?: number | null }[]} monthlyBreakdown
 */
function computeDepositVelocity(monthlyBreakdown) {
  const counts = (monthlyBreakdown || [])
    .map((m) => (Number.isFinite(m.depositCount) ? m.depositCount : null))
    .filter((c) => c != null);
  if (counts.length < 2) {
    return {
      depositVelocityTrend: 'UNKNOWN',
      firstMonthDepositCount: counts[0] ?? null,
      lastMonthDepositCount: counts[counts.length - 1] ?? null,
      depositCountRatio: null,
      stabilityRiskAlert: false,
      stabilityRiskReason: null
    };
  }
  const first = counts[0];
  const last = counts[counts.length - 1];
  let depositVelocityTrend = 'STABLE';
  let ratio = null;
  if (first > 0) {
    ratio = round(last / first, 4);
    if (ratio >= 1.25) depositVelocityTrend = 'GROWTH';
    else if (ratio <= 0.75) depositVelocityTrend = 'DECLINING';
    else depositVelocityTrend = 'STABLE';
  } else if (last > 0) {
    depositVelocityTrend = 'GROWTH';
  }

  let stabilityRiskAlert = false;
  let stabilityRiskReason = null;
  if (first >= 10 && last <= 3) {
    stabilityRiskAlert = true;
    stabilityRiskReason = 'Deposit frequency fell sharply (stability risk)';
  } else if (first >= 5 && last <= 1 && first - last >= 4) {
    stabilityRiskAlert = true;
    stabilityRiskReason = 'Deposit frequency collapsed in the analysis window';
  }

  return {
    depositVelocityTrend,
    firstMonthDepositCount: first,
    lastMonthDepositCount: last,
    depositCountRatio: ratio,
    stabilityRiskAlert,
    stabilityRiskReason
  };
}

function computeLiquidityFloor(financialSummary, balanceAnalysis) {
  const adb = Number(balanceAnalysis?.averageDailyBalance) || 0;
  const opening = Number(financialSummary?.openingBalance) || 0;
  if (adb <= 0) return { gapPercentage: null, isHighRisk: false };
  const raw = (1 - opening / adb) * 100;
  const gapPercentage = Math.max(0, Math.min(100, Math.round(raw)));
  return { gapPercentage, isHighRisk: gapPercentage >= 80 };
}

export function computeForensicIntelligence({
  transactions = [],
  financialSummary = {},
  balanceAnalysis = {},
  requestedLoanAmount = 0,
  daysCovered = 90,
  months = 3,
  transferFilterHints = {}
} = {}) {
  let bucket = bucketByMonth(transactions, months, transferFilterHints);
  const internalTransferExclusion = {
    excludedDepositCount: bucket.excludedInternalTransferCount ?? 0,
    excludedAmount: bucket.excludedInternalTransferAmount ?? 0
  };

  if (!bucket.totalsFromTxns) {
    bucket = syntheticBreakdown(financialSummary, months);
    internalTransferExclusion.excludedDepositCount = 0;
    internalTransferExclusion.excludedAmount = 0;
  }

  const monthlyNet = bucket.monthlyBreakdown.reduce((s, m) => s + (m.net || 0), 0);
  const monthlyNetCashFlow =
    bucket.monthlyBreakdown.length > 0 ? monthlyNet / bucket.monthlyBreakdown.length : 0;

  const proposedMonthly = Number(requestedLoanAmount) * 0.02;
  const prospectiveDSCR = proposedMonthly > 0 ? round(monthlyNetCashFlow / proposedMonthly, 2) : null;

  const totalWithdrawalsWindow = bucket.monthlyBreakdown.reduce((s, m) => s + (m.withdrawals || 0), 0);
  const totalWithdrawalsForBurn =
    totalWithdrawalsWindow > 0 ? totalWithdrawalsWindow : Number(financialSummary?.totalWithdrawals) || 0;
  const dailyBurn = totalWithdrawalsForBurn > 0 ? totalWithdrawalsForBurn / daysCovered : 0;
  const adb = Number(balanceAnalysis?.averageDailyBalance) || 0;
  const daysCashOnHand = dailyBurn > 0 ? Math.round(adb / dailyBurn) : null;

  const depositConsistencyScore = computeConsistency(bucket.monthlyBreakdown);
  const momentum = computeMomentum(bucket.monthlyBreakdown);
  const liquidityFloor = computeLiquidityFloor(financialSummary, balanceAnalysis);
  const depositVelocity = computeDepositVelocity(bucket.monthlyBreakdown);

  return {
    prospectiveDSCR,
    daysCashOnHand,
    depositConsistencyScore,
    momentum,
    liquidityFloor,
    depositVelocityTrend: depositVelocity.depositVelocityTrend,
    depositVelocityMetrics: {
      firstMonthDepositCount: depositVelocity.firstMonthDepositCount,
      lastMonthDepositCount: depositVelocity.lastMonthDepositCount,
      depositCountRatio: depositVelocity.depositCountRatio
    },
    stabilityRiskAlert: depositVelocity.stabilityRiskAlert,
    stabilityRiskReason: depositVelocity.stabilityRiskReason,
    internalTransferExclusion,
    window: {
      months,
      startMonth: bucket.startMonth,
      endMonth: bucket.endMonth,
      monthlyBreakdown: bucket.monthlyBreakdown,
      proposedMonthlyPayment: proposedMonthly > 0 ? round(proposedMonthly, 2) : null,
      monthlyNetCashFlow: round(monthlyNetCashFlow, 2),
      requestedLoanAmount: Number(requestedLoanAmount) || 0,
      daysCovered
    },
    computedAt: new Date().toISOString()
  };
}

export default computeForensicIntelligence;
