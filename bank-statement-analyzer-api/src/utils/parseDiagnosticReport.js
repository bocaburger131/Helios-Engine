/**
 * Four-stage parse diagnostics for checksum / row-extraction debugging.
 * Enable with PARSE_DEBUG=true
 */

import riskAnalysisService from '../services/riskAnalysisService.js';
import { isLedgerInflow, isLedgerOutflow } from './transactionNormalization.js';

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

export function txnFingerprint(tx) {
  const date = String(tx?.date || tx?.transactionDate || '').slice(0, 10);
  const amt = Number(tx?.amount);
  const amountKey = Number.isFinite(amt) ? Math.abs(amt).toFixed(2) : '0';
  const desc = String(tx?.description || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 40);
  return `${date}|${amountKey}|${desc}`;
}

/** Remove exact duplicate rows (same date, amount, description prefix). */
export function dedupeExactFingerprints(transactions) {
  if (!Array.isArray(transactions)) return [];
  const seen = new Set();
  const out = [];
  for (const tx of transactions) {
    const fp = txnFingerprint(tx);
    if (seen.has(fp)) continue;
    seen.add(fp);
    out.push(tx);
  }
  return out;
}

function sampleRows(transactions, limit = 5) {
  return (transactions || []).slice(0, limit).map((t) => ({
    date: t.date,
    amount: t.amount,
    type: t.type,
    description: String(t.description || '').slice(0, 60)
  }));
}

function sumLedgerTotals(transactions) {
  let deposits = 0;
  let withdrawals = 0;
  for (const tx of transactions || []) {
    if (tx?.excludeFromMacroTotals || tx?.parseExcluded) continue;
    const n = Number(tx.amount);
    if (!Number.isFinite(n)) continue;
    if (isLedgerInflow(tx)) deposits += Math.abs(n);
    else if (isLedgerOutflow(tx)) withdrawals += Math.abs(n);
  }
  return {
    parsedDeposits: round2(deposits),
    parsedWithdrawals: round2(withdrawals),
    transactionCount: (transactions || []).filter((t) => !t?.parseExcluded).length
  };
}

function findDuplicateFingerprints(transactions) {
  const counts = new Map();
  for (const tx of transactions || []) {
    const fp = txnFingerprint(tx);
    counts.set(fp, (counts.get(fp) || 0) + 1);
  }
  return [...counts.entries()]
    .filter(([, c]) => c > 1)
    .map(([fingerprint, count]) => ({ fingerprint, count }));
}

export function buildParseDiagnosticReport({
  fileName = '',
  rawRows = [],
  afterSanitize = [],
  afterHints = [],
  stitcherPrinted = null,
  checksumRecon = null,
  parseSanityStats = null
} = {}) {
  const finalRows = afterHints.length ? afterHints : afterSanitize.length ? afterSanitize : rawRows;
  const totals = sumLedgerTotals(finalRows);
  const serviceTotals = riskAnalysisService.calculateTotalDepositsAndWithdrawals(finalRows);

  const printedDeposits = stitcherPrinted?.totalDeposits ?? null;
  const printedWithdrawals = stitcherPrinted?.totalWithdrawals ?? null;

  let depositsDriftPct = null;
  if (printedDeposits != null && Number(printedDeposits) > 0) {
    depositsDriftPct = round2(
      (Math.abs(totals.parsedDeposits - printedDeposits) / printedDeposits) * 100
    );
  }

  return {
    fileName,
    generatedAt: new Date().toISOString(),
    stages: {
      raw: { count: rawRows.length, sample: sampleRows(rawRows) },
      afterSanitize: { count: afterSanitize.length, sample: sampleRows(afterSanitize) },
      afterHints: { count: afterHints.length, sample: sampleRows(afterHints) }
    },
    totals: {
      ...totals,
      serviceDeposits: round2(serviceTotals.totalDeposits),
      serviceWithdrawals: round2(serviceTotals.totalWithdrawals),
      printedDeposits,
      printedWithdrawals,
      depositsDriftPct
    },
    checksum: checksumRecon
      ? {
          ok: checksumRecon.ok,
          opening: checksumRecon.opening,
          closing: checksumRecon.closing,
          deposits: checksumRecon.deposits,
          withdrawals: checksumRecon.withdrawals,
          computedClosing: checksumRecon.computedClosing,
          delta: checksumRecon.delta,
          reason: checksumRecon.reason
        }
      : null,
    duplicateFingerprints: findDuplicateFingerprints(finalRows),
    parseSanityStats: parseSanityStats || null
  };
}

export function parseDebugEnabled() {
  const v = process.env.PARSE_DEBUG;
  return v === 'true' || v === '1';
}

export default {
  buildParseDiagnosticReport,
  dedupeExactFingerprints,
  txnFingerprint,
  parseDebugEnabled
};
