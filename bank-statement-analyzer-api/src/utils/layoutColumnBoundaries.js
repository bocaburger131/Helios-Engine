/**
 * Resolve Gemini layout column X-boundaries into pdfplumber explicitVerticalLines.
 */

/**
 * @param {unknown} raw
 * @returns {number[] | undefined}
 */
export function normalizeExplicitVerticalLines(raw) {
  if (!Array.isArray(raw)) return undefined;
  const nums = [...new Set(raw.map(Number).filter(Number.isFinite))].sort(
    (a, b) => a - b
  );
  return nums.length > 0 ? nums : undefined;
}

/**
 * @param {unknown} raw
 * @returns {Record<string, number> | undefined}
 */
export function normalizeColumnBoundaries(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  /** @type {Record<string, number>} */
  const out = {};
  for (const [k, v] of Object.entries(raw)) {
    const n = Number(v);
    if (Number.isFinite(n)) out[k] = n;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

/**
 * Prefer explicitVerticalLines; else derive sorted unique X from columnBoundaries.
 * @param {{ explicitVerticalLines?: unknown, columnBoundaries?: unknown }} parsed
 * @returns {{ explicitVerticalLines?: number[], columnBoundaries?: Record<string, number> }}
 */
export function resolveLayoutColumnGeometry(parsed = {}) {
  const columnBoundaries = normalizeColumnBoundaries(parsed.columnBoundaries);
  let explicitVerticalLines = normalizeExplicitVerticalLines(
    parsed.explicitVerticalLines
  );
  if (!explicitVerticalLines && columnBoundaries) {
    explicitVerticalLines = normalizeExplicitVerticalLines(
      Object.values(columnBoundaries)
    );
  }
  return {
    ...(columnBoundaries ? { columnBoundaries } : {}),
    ...(explicitVerticalLines ? { explicitVerticalLines } : {})
  };
}

/**
 * @param {object|null|undefined} layout
 * @returns {boolean}
 */
export function hasUsableExplicitVerticalLines(layout) {
  const lines = normalizeExplicitVerticalLines(layout?.explicitVerticalLines);
  if (lines && lines.length >= 3) return true;
  // Derive from columnBoundaries (xDate/xDesc/xDeposit/…) when lines missing.
  const derived = resolveLayoutColumnGeometry(layout || {});
  const derivedLines = normalizeExplicitVerticalLines(derived.explicitVerticalLines);
  return Boolean(derivedLines && derivedLines.length >= 3);
}
