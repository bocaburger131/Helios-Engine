/**
 * When checksum fails, search raw PDF text for the reconciliation delta amount
 * to identify skipped summary lines or missing tables.
 */

import logger from './logger.js';

const PRINTED_TOTAL_PATTERNS = [
  { key: 'totalDeposits', re: /total\s+deposits?/i },
  { key: 'totalWithdrawals', re: /total\s+withdrawals?/i },
  { key: 'depositsCredits', re: /deposits?\s*(?:\/|and)\s*credits?/i },
  { key: 'withdrawalsDebits', re: /withdrawals?\s*(?:\/|and)\s*debits?/i },
  { key: 'beginningBalance', re: /beginning\s+balance/i },
  { key: 'endingBalance', re: /(?:ending|closing)\s+balance/i }
];

/**
 * @param {number|string} delta
 * @returns {string[]}
 */
export function buildDeltaSearchVariants(delta) {
  const n = Math.abs(Number(delta));
  if (!Number.isFinite(n) || n < 0.01) return [];

  const fixed = n.toFixed(2);
  const [intPart, decPart] = fixed.split('.');
  const withCommas = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');

  const variants = new Set([
    fixed,
    `${intPart}.${decPart}`,
    `${withCommas}.${decPart}`,
    `(${fixed})`,
    `(${withCommas}.${decPart})`,
    `-$${fixed}`,
    `$${fixed}`,
    `$${withCommas}.${decPart}`
  ]);

  return [...variants].filter((v) => v.length >= 4);
}

/**
 * @param {string} rawText
 * @param {number|string} delta
 * @param {{ contextRadius?: number, maxMatches?: number }} [options]
 * @returns {{ probeMiss: boolean, formattedVariants: string[], matches: Array<{ variant: string, index: number, context: string }> }}
 */
export function probeChecksumDeltaInText(rawText, delta, options = {}) {
  const contextRadius = options.contextRadius ?? 50;
  const maxMatches = options.maxMatches ?? 5;
  const text = String(rawText || '');

  const formattedVariants = buildDeltaSearchVariants(delta);
  if (!text || formattedVariants.length === 0) {
    return { probeMiss: true, formattedVariants, matches: [] };
  }

  const matches = [];
  const lower = text.toLowerCase();

  for (const variant of formattedVariants) {
    const needle = variant.toLowerCase();
    let from = 0;
    while (matches.length < maxMatches) {
      const idx = lower.indexOf(needle, from);
      if (idx < 0) break;
      const start = Math.max(0, idx - contextRadius);
      const end = Math.min(text.length, idx + needle.length + contextRadius);
      matches.push({
        variant,
        index: idx,
        context: text.slice(start, end).replace(/\s+/g, ' ')
      });
      from = idx + needle.length;
    }
    if (matches.length >= maxMatches) break;
  }

  return {
    probeMiss: matches.length === 0,
    formattedVariants,
    matches: matches.slice(0, maxMatches)
  };
}

/**
 * @param {object|null} checksumRecon
 * @returns {object|null}
 */
export function buildReconciliationBreakdown(checksumRecon) {
  if (!checksumRecon || typeof checksumRecon !== 'object') return null;

  const opening = Number(checksumRecon.opening ?? checksumRecon.openingBalance);
  const closing = Number(checksumRecon.closing ?? checksumRecon.closingBalance);
  const deposits = Number(checksumRecon.deposits ?? checksumRecon.totalDeposits);
  const withdrawals = Number(checksumRecon.withdrawals ?? checksumRecon.totalWithdrawals);
  const computedClosing = Number(checksumRecon.computedClosing);
  const delta = Number(checksumRecon.delta);

  const breakdown = {
    opening: Number.isFinite(opening) ? opening : null,
    closing: Number.isFinite(closing) ? closing : null,
    deposits: Number.isFinite(deposits) ? deposits : null,
    withdrawals: Number.isFinite(withdrawals) ? withdrawals : null,
    computedClosing: Number.isFinite(computedClosing)
      ? computedClosing
      : Number.isFinite(opening) && Number.isFinite(deposits) && Number.isFinite(withdrawals)
        ? opening + deposits - withdrawals
        : null,
    delta: Number.isFinite(delta) ? delta : null
  };

  return breakdown;
}

/**
 * @param {string} rawText
 * @param {{ contextRadius?: number, maxHits?: number }} [options]
 * @returns {Array<{ key: string, index: number, context: string }>}
 */
export function searchPrintedPeriodTotals(rawText, options = {}) {
  const contextRadius = options.contextRadius ?? 50;
  const maxHits = options.maxHits ?? 8;
  const text = String(rawText || '');
  if (!text) return [];

  const hits = [];
  const lower = text.toLowerCase();

  for (const { key, re } of PRINTED_TOTAL_PATTERNS) {
    const m = lower.match(re);
    if (!m || m.index == null) continue;
    const idx = m.index;
    const start = Math.max(0, idx - contextRadius);
    const end = Math.min(text.length, idx + m[0].length + contextRadius);
    hits.push({
      key,
      index: idx,
      context: text.slice(start, end).replace(/\s+/g, ' ')
    });
    if (hits.length >= maxHits) break;
  }

  return hits;
}

/**
 * @param {string} fileName
 * @param {object} checksumRecon
 * @param {string} [rawText]
 * @param {{ txnCount?: number }} [options]
 * @returns {object|null}
 */
export function runChecksumDeltaProbe(fileName, checksumRecon, rawText, options = {}) {
  if (!checksumRecon || checksumRecon.ok) return null;
  const delta = checksumRecon.delta ?? checksumRecon.computedClosing;
  const probe = probeChecksumDeltaInText(rawText, delta);
  const reconciliationBreakdown = buildReconciliationBreakdown(checksumRecon);
  const printedTotals =
    probe.probeMiss && rawText ? searchPrintedPeriodTotals(rawText) : [];

  const probeHint = probe.probeMiss ? 'AGGREGATE_MISMATCH' : 'LITERAL_DELTA_FOUND';
  const txnCount = options.txnCount ?? checksumRecon.txnCount ?? null;

  logger.warn('[CHECKSUM_DELTA_PROBE] checksum mismatch context search', {
    fileName,
    delta,
    probeMiss: probe.probeMiss,
    probeHint,
    variantCount: probe.formattedVariants.length,
    matchCount: probe.matches.length,
    txnCount,
    reconciliationBreakdown,
    printedTotals: printedTotals.length ? printedTotals : undefined,
    matches: probe.matches
  });

  return {
    delta,
    probeMiss: probe.probeMiss,
    probeHint,
    reconciliationBreakdown: reconciliationBreakdown
      ? { ...reconciliationBreakdown, txnCount }
      : txnCount != null
        ? { txnCount }
        : null,
    printedTotals,
    topMatches: probe.matches.slice(0, 3)
  };
}

export default {
  buildDeltaSearchVariants,
  probeChecksumDeltaInText,
  buildReconciliationBreakdown,
  searchPrintedPeriodTotals,
  runChecksumDeltaProbe
};
