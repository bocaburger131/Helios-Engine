/**
 * Universal pdfplumber row normalization (preserves section + dateRaw for bank profiles).
 */

export const PLUMBER_ROW_AMOUNT_CAP = 250_000;
const ROUTING_BLEED_RE = /\b\d{9,}\b/;

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

  if (
    ROUTING_BLEED_RE.test(description) &&
    (absAmt > 25_000 || /\b(?:trn|trace|orig\s+co|ind\s+name)\b/i.test(description))
  ) {
    return null;
  }

  const dateRaw = String(row.dateRaw ?? row.date ?? '').trim();
  const isoDate = parsePlumberRowDate(dateRaw, defaultYear);
  if (!isoDate) return null;

  const section = row.section != null ? String(row.section) : '';
  const signed = type === 'DEBIT' ? -absAmt : absAmt;

  return {
    date: isoDate,
    dateRaw,
    description,
    amount: signed,
    type: type === 'DEBIT' ? 'DEBIT' : 'CREDIT',
    section,
    rawAmount: absAmt.toFixed(2),
    rawLine: `[PDF_PLUMBER] ${description}`,
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
