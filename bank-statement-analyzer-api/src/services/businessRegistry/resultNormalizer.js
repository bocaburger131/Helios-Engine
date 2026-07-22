/**
 * Canonical business registry verification result shape.
 */

const ACTIVE_STATUS_RE = /active|good\s*standing|current|in\s*existence/i;

/**
 * @param {object} params
 * @returns {object}
 */
export function buildSkippedResult(reason, extra = {}) {
  return {
    found: false,
    isActive: false,
    skipped: true,
    reason,
    source: 'businessRegistryOrchestrator',
    timestamp: new Date().toISOString(),
    ...extra
  };
}

/**
 * @param {object} params
 * @param {string} params.businessName
 * @param {string} params.stateCode
 * @param {boolean} params.found
 * @param {string} [params.status]
 * @param {string} [params.registrationDate]
 * @param {string} [params.matchedBusinessName]
 * @param {boolean} [params.isActive]
 * @param {string} [params.playbookVersion]
 * @param {string} [params.accessTier]
 * @param {string} [params.reason]
 * @param {object} [params.extra]
 */
export function normalizeRegistryResult(params) {
  const {
    businessName,
    stateCode,
    found,
    status = null,
    registrationDate = null,
    matchedBusinessName = null,
    isActive = found ? ACTIVE_STATUS_RE.test(String(status || '')) : false,
    playbookVersion = null,
    accessTier = null,
    reason = null,
    extra = {}
  } = params;

  return {
    found: Boolean(found),
    isActive,
    status,
    registrationDate,
    matchedBusinessName,
    businessName,
    state: stateCode,
    source: 'businessRegistryOrchestrator',
    playbookVersion,
    accessTier,
    reason,
    verificationAttempted: true,
    timestamp: new Date().toISOString(),
    ...extra
  };
}

/**
 * Score name similarity for best-match selection.
 * @param {string} a
 * @param {string} b
 * @returns {number} 0–1
 */
export function nameSimilarity(a, b) {
  if (!a || !b) return 0;
  const na = a.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
  const nb = b.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  if (na.includes(nb) || nb.includes(na)) return 0.85;
  const ta = new Set(na.split(/\s+/));
  const tb = new Set(nb.split(/\s+/));
  let overlap = 0;
  for (const t of ta) {
    if (tb.has(t)) overlap++;
  }
  return overlap / Math.max(ta.size, tb.size, 1);
}

/**
 * Pick best row from scrape results.
 * @param {Array<{ entityName?: string, businessName?: string, status?: string, registrationDate?: string }>} rows
 * @param {string} searchedName
 */
export function pickBestMatch(rows, searchedName) {
  if (!Array.isArray(rows) || rows.length === 0) return null;
  let best = null;
  let bestScore = -1;
  for (const row of rows) {
    const name = row.entityName || row.businessName || '';
    const score = nameSimilarity(searchedName, name);
    if (score > bestScore) {
      bestScore = score;
      best = row;
    }
  }
  return best;
}

export default {
  buildSkippedResult,
  normalizeRegistryResult,
  nameSimilarity,
  pickBestMatch
};
