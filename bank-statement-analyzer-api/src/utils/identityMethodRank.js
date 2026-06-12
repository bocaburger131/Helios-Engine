/**
 * Identity waterfall method strength (higher = stronger deterministic signal).
 * @license Copyright (c) 2025 Shift 4 Financial INC
 */

/** @param {string} [name] */
export function normalizeInstitutionName(name) {
  if (!name || typeof name !== 'string') return '';
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * @param {string} [method]
 * @returns {number}
 */
export function identityMethodRank(method) {
  const m = String(method || '').toUpperCase();
  switch (m) {
    case 'RTN_HARD_LOCK':
      return 50;
    case 'FDIC_COMPLIANCE_LOCK':
      return 40;
    case 'ANCHOR_LOCK':
      return 30;
    case 'ANCHOR_PARTIAL':
      return 25;
    case 'ANCHOR_SIGNAL':
      return 20;
    case 'TEXT_BRAND_LOCK':
      return 15;
    case 'HUMAN_REQUIRED':
      return 0;
    default:
      return 10;
  }
}

/** Minimum rank to prefer parser `bankName` over enrichBankData `legalName`. */
export const WATERFALL_LEGAL_NAME_MIN_RANK = identityMethodRank('ANCHOR_LOCK');
