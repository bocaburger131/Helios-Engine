/**
 * Shared allowlists for analyst transaction categorization overrides.
 * Values are stored uppercase (Transaction schema setters).
 */

export const HIGH_LEVEL_CATEGORIES = Object.freeze([
  'COGS',
  'OPEX',
  'PAYROLL',
  'DEBT SERVICE',
  'NON-REVENUE TRANSFER',
  'HIGH-RISK',
  'EXCLUDED'
]);

/** @type {Readonly<Record<string, readonly string[]>>} */
export const SUBCATEGORIES_BY_HIGH_LEVEL = Object.freeze({
  COGS: Object.freeze(['EQUIPMENT', 'INVENTORY', 'SUPPLIES']),
  OPEX: Object.freeze([
    'RENT',
    'UTILITIES',
    'SOFTWARE',
    'MERCHANT FEE',
    'INSURANCE',
    'OTHER OPEX'
  ]),
  PAYROLL: Object.freeze(['WAGES', 'CONTRACTOR', 'BENEFITS', 'PAYROLL TAX']),
  'DEBT SERVICE': Object.freeze(['LOAN DEBIT', 'MCA DEBIT', 'CREDIT CARD PAYMENT']),
  'NON-REVENUE TRANSFER': Object.freeze([
    'INTERNAL TRANSFER',
    'OWNER DRAW',
    'OWNER CONTRIBUTION'
  ]),
  'HIGH-RISK': Object.freeze(['GAMBLING', 'CASH ADVANCE', 'CRYPTO', 'OTHER HIGH-RISK']),
  EXCLUDED: Object.freeze(['DUPLICATE', 'VOID', 'REVERSAL', 'OTHER EXCLUDED'])
});

export const TAX_DEDUCTIBLE_VALUES = Object.freeze([
  'deductible',
  'non_deductible',
  'unknown'
]);

/**
 * @param {string} raw
 * @returns {string}
 */
export function normalizeHighLevelCategory(raw) {
  const s = String(raw || '')
    .trim()
    .toUpperCase()
    .replace(/_/g, ' ');
  if (HIGH_LEVEL_CATEGORIES.includes(s)) return s;
  if (s.includes('COGS') || s.includes('EQUIPMENT') || s.includes('INVENTORY')) return 'COGS';
  if (s.includes('PAYROLL') || s.includes('WAGE') || s.includes('SALARY')) return 'PAYROLL';
  if (s.includes('DEBT') || s.includes('MCA') || s.includes('LOAN DEBIT')) return 'DEBT SERVICE';
  if (s.includes('TRANSFER') || s.includes('NON-REVENUE') || s.includes('NON REVENUE')) {
    return 'NON-REVENUE TRANSFER';
  }
  if (s.includes('HIGH') && s.includes('RISK')) return 'HIGH-RISK';
  if (s.includes('EXCLUD') || s.includes('VOID')) return 'EXCLUDED';
  if (s.includes('OPEX') || s.includes('OPERATIONS') || s.includes('RENT') || s.includes('UTILIT')) {
    return 'OPEX';
  }
  return '';
}

/**
 * @param {string} highLevel
 * @param {string} rawSub
 * @returns {string}
 */
export function normalizeSubcategory(highLevel, rawSub) {
  const hl = normalizeHighLevelCategory(highLevel) || String(highLevel || '').toUpperCase();
  const allowed = SUBCATEGORIES_BY_HIGH_LEVEL[hl] || [];
  const s = String(rawSub || '')
    .trim()
    .toUpperCase()
    .replace(/_/g, ' ');
  if (!s) return '';
  if (allowed.includes(s)) return s;
  return '';
}

/**
 * @param {{ category?: string, subcategory?: string, taxDeductible?: string }} body
 * @returns {{ ok: true, category: string, subcategory: string|null, taxDeductible: string|null } | { ok: false, error: string }}
 */
export function validateCategorizerOverrideBody(body = {}) {
  const category = normalizeHighLevelCategory(body.category);
  if (!category) {
    return {
      ok: false,
      error: `Invalid category. Allowed: ${HIGH_LEVEL_CATEGORIES.join(', ')}`
    };
  }

  let subcategory = null;
  if (body.subcategory != null && String(body.subcategory).trim() !== '') {
    subcategory = normalizeSubcategory(category, body.subcategory);
    if (!subcategory) {
      const allowed = SUBCATEGORIES_BY_HIGH_LEVEL[category] || [];
      return {
        ok: false,
        error: `Invalid subcategory for ${category}. Allowed: ${allowed.join(', ')}`
      };
    }
  }

  let taxDeductible = null;
  if (body.taxDeductible != null && String(body.taxDeductible).trim() !== '') {
    const t = String(body.taxDeductible).trim().toLowerCase();
    if (!TAX_DEDUCTIBLE_VALUES.includes(t)) {
      return {
        ok: false,
        error: `Invalid taxDeductible. Allowed: ${TAX_DEDUCTIBLE_VALUES.join(', ')}`
      };
    }
    taxDeductible = t;
  }

  return { ok: true, category, subcategory, taxDeductible };
}
