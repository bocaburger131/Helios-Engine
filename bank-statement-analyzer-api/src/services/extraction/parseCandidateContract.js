/**
 * Canonical ParseCandidate contract: provenance, fingerprints, selection.
 * Never merge whole transaction lists across engines.
 */
import crypto from 'crypto';

export const SECTION_OWNERS = Object.freeze({
  PRIMARY_ACTIVITY: 'primary_activity',
  CHECKS: 'checks',
  FEES: 'fees',
  RETURNED_ITEMS: 'returned_items',
  ADJUSTMENTS: 'adjustments',
  SUMMARY_ONLY: 'summary_only'
});

/** Deterministic engine preference (final tie-breaker). Lower = preferred. */
export const ENGINE_RANK = Object.freeze({
  plumber: 0,
  pdfplumber: 0,
  text: 1,
  pdf_parse: 1,
  marker: 2,
  native: 3
});

const SUMMARY_DESC_RE =
  /^(beginning|ending|opening|closing)\s+balance$|daily\s+balance|balance\s+forward|total\s+(deposits|withdrawals|credits|debits)|account\s+summary/i;

/**
 * @param {number|string} n
 * @returns {number}
 */
export function toCents(n) {
  return Math.round(Number(n || 0) * 100);
}

/**
 * Stable row fingerprint for dedupe / overlap proofs.
 * Excludes section so the same economic event cannot be appended twice
 * under primary_activity and a supplemental owner.
 * @param {object} row
 * @returns {string}
 */
export function rowFingerprint(row) {
  const date = String(row?.date ?? row?.postedDate ?? '').slice(0, 12);
  const amt = toCents(row?.amount);
  const desc = String(row?.description || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 64);
  const checkNo = row?.checkNo != null ? String(row.checkNo) : '';
  return `${date}|${amt}|${desc}|${checkNo}`;
}

/**
 * @param {object} row
 * @returns {string}
 */
export function sourceTextHash(row) {
  const raw = `${row?.date ?? ''}|${row?.description ?? ''}|${row?.amount ?? ''}`;
  return crypto.createHash('sha1').update(raw).digest('hex').slice(0, 16);
}

/**
 * Infer section ownership from tags / description.
 * @param {object} row
 * @returns {string}
 */
export function inferSectionOwner(row) {
  const tag = String(row?.sectionId || row?.section || row?.sectionLabel || '').toLowerCase();
  const desc = String(row?.description || '');
  if (row?.summaryOnly || SUMMARY_DESC_RE.test(desc.trim())) {
    return SECTION_OWNERS.SUMMARY_ONLY;
  }
  if (/return/.test(tag) || /returned\s+item|returned\s+check/i.test(desc)) {
    return SECTION_OWNERS.RETURNED_ITEMS;
  }
  if (/fee/.test(tag) || /\bfee(s)?\b/i.test(desc)) return SECTION_OWNERS.FEES;
  if (/check/.test(tag) || /^check\s*#?\d+/i.test(desc)) return SECTION_OWNERS.CHECKS;
  if (/adjust/.test(tag)) return SECTION_OWNERS.ADJUSTMENTS;
  return SECTION_OWNERS.PRIMARY_ACTIVITY;
}

/**
 * Normalize rows onto the canonical candidate schema.
 * @param {Array<object>} transactions
 * @param {{ sourceEngine: string }} opts
 * @returns {Array<object>}
 */
export function normalizeCandidateRows(transactions, opts = {}) {
  const sourceEngine = opts.sourceEngine || 'text';
  return (transactions || []).map((t, i) => {
    const sectionOwner = t.sectionOwner || inferSectionOwner(t);
    const fp = t.rowFingerprint || rowFingerprint(t);
    return {
      ...t,
      sourceEngine: t.sourceEngine || sourceEngine,
      page: t.page ?? t.pageNumber ?? null,
      sectionId: t.sectionId || t.section || t.sectionLabel || sectionOwner,
      sectionOwner,
      sourceTextHash: t.sourceTextHash || sourceTextHash(t),
      rowFingerprint: fp,
      amountCents: t.amountCents ?? toCents(t.amount),
      _idx: i
    };
  });
}

/**
 * Drop summary_only rows from the ledger (they may still validate totals).
 * @param {Array<object>} rows
 * @returns {{ ledger: Array<object>, discarded: Array<object> }}
 */
export function partitionSummaryRows(rows) {
  const ledger = [];
  const discarded = [];
  for (const r of rows || []) {
    if (r.sectionOwner === SECTION_OWNERS.SUMMARY_ONLY) discarded.push(r);
    else ledger.push(r);
  }
  return { ledger, discarded };
}

/**
 * @param {object} input
 * @returns {object} ParseCandidate
 */
export function createParseCandidate(input = {}) {
  const engine = input.engine || input.sourceEngine || 'text';
  const normalized = normalizeCandidateRows(input.transactions || [], {
    sourceEngine: engine
  });
  const { ledger, discarded } = partitionSummaryRows(normalized);
  const fingerprints = ledger.map((r) => r.rowFingerprint);
  const unique = new Set(fingerprints);
  return {
    engine,
    transactions: ledger,
    discardedRows: discarded,
    meta: input.meta || {},
    documentClass: input.documentClass || null,
    provenanceStrength: scoreProvenance(ledger, engine),
    duplicateFingerprintCount: fingerprints.length - unique.size,
    sectionCoverage: computeSectionCoverage(ledger),
    anomalousRowCount: discarded.length + (fingerprints.length - unique.size)
  };
}

/**
 * @param {Array<object>} rows
 * @param {string} engine
 * @returns {number} higher = stronger
 */
function scoreProvenance(rows, engine) {
  let score = 0;
  const rank = ENGINE_RANK[engine] ?? 5;
  score += Math.max(0, 3 - rank) * 10;
  const withPage = rows.filter((r) => r.page != null).length;
  const withCoords = rows.filter((r) => r.x0 != null || r.bbox || r.coords).length;
  if (rows.length) {
    score += Math.round((withPage / rows.length) * 20);
    score += Math.round((withCoords / rows.length) * 30);
  }
  return score;
}

/**
 * @param {Array<object>} rows
 * @returns {Record<string, number>}
 */
export function computeSectionCoverage(rows) {
  const cov = {};
  for (const r of rows || []) {
    const o = r.sectionOwner || SECTION_OWNERS.PRIMARY_ACTIVITY;
    cov[o] = (cov[o] || 0) + 1;
  }
  return cov;
}

/**
 * Required-section coverage count (non-summary owners present).
 * @param {object} candidate
 * @param {string[]} [required]
 * @returns {number}
 */
export function requiredSectionCoverageScore(candidate, required) {
  const cov = candidate?.sectionCoverage || {};
  const keys =
    required?.length > 0
      ? required
      : Object.keys(cov).filter((k) => k !== SECTION_OWNERS.SUMMARY_ONLY);
  return keys.filter((k) => (cov[k] || 0) > 0).length;
}

/**
 * Select best among already-VERIFIED candidates. Never uses highest txn count.
 * @param {Array<object>} verifiedCandidates
 * @param {{ documentClass?: string, engineOrder?: string[] }} [opts]
 * @returns {object|null}
 */
export function selectBestVerifiedCandidate(verifiedCandidates, opts = {}) {
  const list = (verifiedCandidates || []).filter((c) => c?.verification?.isVerified);
  if (!list.length) return null;

  const order = Array.isArray(opts.engineOrder) ? opts.engineOrder : null;
  const rankFor = (engine) => {
    if (order?.length) {
      const canon = String(engine || '').replace(/^pdfplumber$/, 'plumber').replace(/^pdf_parse$/, 'text');
      const idx = order.indexOf(canon);
      if (idx >= 0) return idx;
      return 100 + (ENGINE_RANK[engine] ?? 99);
    }
    // Default native_text preference: plumber > text > marker
    return ENGINE_RANK[engine] ?? 99;
  };

  const scored = list.map((c) => {
    const sectionTotalsMatch = c.verification?.printedSectionTotalsOk === true ? 1 : 0;
    const coverage = requiredSectionCoverageScore(c);
    const anomalies = Number(c.anomalousRowCount || 0);
    const provenance = Number(c.provenanceStrength || 0);
    const engineRank = rankFor(c.engine);
    return { c, sectionTotalsMatch, coverage, anomalies, provenance, engineRank };
  });

  scored.sort((a, b) => {
    if (b.sectionTotalsMatch !== a.sectionTotalsMatch) {
      return b.sectionTotalsMatch - a.sectionTotalsMatch;
    }
    if (b.coverage !== a.coverage) return b.coverage - a.coverage;
    // When documentClass supplies an allow-list order, honor it before provenance.
    if (order?.length && a.engineRank !== b.engineRank) {
      return a.engineRank - b.engineRank;
    }
    if (a.anomalies !== b.anomalies) return a.anomalies - b.anomalies;
    if (b.provenance !== a.provenance) return b.provenance - a.provenance;
    return a.engineRank - b.engineRank;
  });

  return scored[0].c;
}

/**
 * Reject inflation candidates before selection.
 * @param {object} verification or classifyChecksumFailure result
 * @returns {boolean}
 */
export function isInflationFailure(failureClass) {
  return (
    failureClass === 'DEPOSIT_INFLATION' || failureClass === 'WITHDRAWAL_INFLATION'
  );
}

export default {
  createParseCandidate,
  normalizeCandidateRows,
  rowFingerprint,
  selectBestVerifiedCandidate,
  toCents,
  SECTION_OWNERS,
  ENGINE_RANK
};
