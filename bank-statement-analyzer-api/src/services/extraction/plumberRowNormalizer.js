/**
 * Universal pdfplumber row normalization (preserves section + dateRaw for bank profiles).
 */

export const PLUMBER_ROW_AMOUNT_CAP = 250_000;
const ROUTING_BLEED_RE = /\b\d{8,}\b/;
const DATE_BLEED_RE = /^\d{1,2}\/\d{3,}/;
const NOISE_DESC_RE = /^\d{1,4}(\s+\d{1,4}){0,3}$/;

/**
 * @param {string} raw
 * @param {number} [defaultYear]
 * @returns {string|null} ISO date YYYY-MM-DD or null
 */
export function parsePlumberRowDate(raw, defaultYear = new Date().getFullYear()) {
  const s = String(raw || '').trim();
  if (!s) return null;

  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  const mdy = s.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?/);
  if (mdy) {
    let y = mdy[3] ? Number(mdy[3]) : defaultYear;
    if (y < 100) y += 2000;
    const mm = String(mdy[1]).padStart(2, '0');
    const dd = String(mdy[2]).padStart(2, '0');
    return `${y}-${mm}-${dd}`;
  }

  const parsed = new Date(s);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString().slice(0, 10);
  }
  return null;
}

/**
 * @param {object} row
 * @param {number} [defaultYear]
 * @returns {object|null}
 */
export function normalizePlumberRow(row, defaultYear = new Date().getFullYear()) {
  if (!row || typeof row !== 'object') return null;

  const type = String(row.type || '').toUpperCase();
  if (type !== 'CREDIT' && type !== 'DEBIT') return null;

  const absAmt = Math.abs(Number(row.amount));
  if (!Number.isFinite(absAmt) || absAmt < 0.01 || absAmt > PLUMBER_ROW_AMOUNT_CAP) return null;

  const description = String(row.description || '').trim();
  if (!description || description.length < 2) return null;
  if (/^total\b/i.test(description)) return null;

  // Trace/reference digits alongside an implausibly large amount indicate
  // numeric bleed. Small amounts with trace digits are legitimate ACH rows
  // (sidecar amounts are strict-parsed, so keyword presence alone is fine).
  if (ROUTING_BLEED_RE.test(description) && absAmt > 25_000) {
    return null;
  }
  // Two+ money tokens in the memo usually means balance/amount column bleed.
  const moneyInDesc = description.match(/\d{1,3}(?:,\d{3})*\.\d{2}/g);
  if (moneyInDesc && moneyInDesc.length >= 2) {
    return null;
  }
  // Daily-balance grid bleed often lands as short numeric noise ("37 37").
  if (NOISE_DESC_RE.test(description) && absAmt > 1_000) {
    return null;
  }

  const dateRaw = String(row.dateRaw ?? row.date ?? '').trim();
  if (DATE_BLEED_RE.test(dateRaw)) return null;
  const isoDate = parsePlumberRowDate(dateRaw, defaultYear);
  if (!isoDate) return null;

  const section = row.section != null ? String(row.section) : '';
  const signed = type === 'DEBIT' ? -absAmt : absAmt;
  // rowIndex (when the extractor provides one) keeps legitimate identical rows
  // (same day/amount/description) distinct through fingerprint dedupe.
  const rowTag = Number.isFinite(Number(row.rowIndex)) ? `#${Number(row.rowIndex)}` : '';

  return {
    date: isoDate,
    dateRaw,
    description,
    amount: signed,
    type: type === 'DEBIT' ? 'DEBIT' : 'CREDIT',
    section,
    rawAmount: absAmt.toFixed(2),
    rawLine: `[PDF_PLUMBER]${rowTag} ${description}`,
    extractionSource: 'pdfplumber'
  };
}

/**
 * @param {object} json Python stdout
 * @param {number} [defaultYear]
 */
export function normalizePlumberJson(json, defaultYear = new Date().getFullYear()) {
  const list = Array.isArray(json?.transactions) ? json.transactions : [];
  const transactions = [];
  for (const row of list) {
    const norm = normalizePlumberRow(row, defaultYear);
    if (norm) transactions.push(norm);
  }

  const opening =
    json?.openingBalance != null && Number.isFinite(Number(json.openingBalance))
      ? Number(json.openingBalance)
      : null;
  const closing =
    json?.closingBalance != null && Number.isFinite(Number(json.closingBalance))
      ? Number(json.closingBalance)
      : null;

  return { transactions, openingBalance: opening, closingBalance: closing };
}

export default {
  parsePlumberRowDate,
  normalizePlumberRow,
  normalizePlumberJson,
  PLUMBER_ROW_AMOUNT_CAP
};
