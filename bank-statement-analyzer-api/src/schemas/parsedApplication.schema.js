/**
 * Strict typed shape for deterministic application PDF extraction.
 * @license Copyright (c) 2025 Shift 4 Financial INC
 */

/** @typedef {'acroform' | 'coordinates' | 'label_proximity' | 'none'} ExtractionMethod */

/**
 * @typedef {Object} ParsedApplication
 * @property {string|null} legalName
 * @property {string|null} dbaName
 * @property {string|null} ein
 * @property {number|null} requestedAmount
 * @property {number|null} grossAnnualRevenue
 * @property {ExtractionMethod} extractionMethod
 * @property {string|null} templateId
 * @property {Record<string, { method: string, confidence: number }>} fieldProvenance
 */

export const PARSED_APPLICATION_FIELDS = [
  'legalName',
  'dbaName',
  'ein',
  'requestedAmount',
  'grossAnnualRevenue'
];

/** @returns {ParsedApplication} */
export function createEmptyParsedApplication() {
  return {
    legalName: null,
    dbaName: null,
    ein: null,
    requestedAmount: null,
    grossAnnualRevenue: null,
    extractionMethod: 'none',
    templateId: null,
    fieldProvenance: {}
  };
}

/**
 * @param {Partial<ParsedApplication>} raw
 * @returns {ParsedApplication}
 */
export function normalizeParsedApplication(raw = {}) {
  const out = createEmptyParsedApplication();
  out.legalName = sanitizeString(raw.legalName);
  out.dbaName = sanitizeString(raw.dbaName);
  out.ein = normalizeEin(raw.ein);
  out.requestedAmount = parseCurrency(raw.requestedAmount);
  out.grossAnnualRevenue = parseCurrency(raw.grossAnnualRevenue);
  out.extractionMethod = raw.extractionMethod || 'none';
  out.templateId = raw.templateId || null;
  out.fieldProvenance =
    raw.fieldProvenance && typeof raw.fieldProvenance === 'object' ? { ...raw.fieldProvenance } : {};
  return out;
}

function sanitizeString(v) {
  if (v == null) return null;
  const s = String(v).trim().replace(/\s+/g, ' ');
  if (!s || /^(n\/a|none|na|-)$/i.test(s)) return null;
  return s;
}

/** @returns {string|null} XX-XXXXXXX */
export function normalizeEin(value) {
  if (value == null) return null;
  const digits = String(value).replace(/\D/g, '');
  if (digits.length !== 9) return null;
  return `${digits.slice(0, 2)}-${digits.slice(2)}`;
}

/** @returns {number|null} */
export function parseCurrency(value) {
  if (value == null || value === '') return null;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const cleaned = String(value).replace(/[$,\s]/g, '');
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

export default {
  createEmptyParsedApplication,
  normalizeParsedApplication,
  normalizeEin,
  parseCurrency,
  PARSED_APPLICATION_FIELDS
};
