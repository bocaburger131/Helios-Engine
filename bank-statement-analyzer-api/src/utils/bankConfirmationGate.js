/**
 * Whether the caller should pause for human bank confirmation.
 * Human input is only required when bank identity is actually unresolved.
 * @license Copyright (c) 2025 Shift 4 Financial INC
 */

import { normalizeInstitutionName } from './identityMethodRank.js';

/**
 * @param {{
 *   identityMethod?: string,
 *   bankName?: string|null,
 *   bankNameConfidence?: string,
 *   profileConfidence?: number|null
 * }} input
 * @returns {boolean}
 */
export function resolveRequiresBankConfirmation({
  identityMethod,
  bankName,
  bankNameConfidence,
  profileConfidence
}) {
  const profileConf = Number(profileConfidence);
  if (Number.isFinite(profileConf) && profileConf >= 0.9 && bankName) {
    return false;
  }

  if (String(identityMethod || '').toUpperCase() !== 'HUMAN_REQUIRED') {
    return false;
  }

  return !bankName || bankNameConfidence === 'LOW';
}

/**
 * Whether a user-confirmed bank name applies to this file in a batch.
 * @param {string|null|undefined} confirmedBankName
 * @param {string|null|undefined} confirmedBankFileName
 * @param {string} fileOriginalName
 * @param {string|null|undefined} detectedBankName
 * @param {(name: string) => string} normalizeInstitutionNameFn
 * @returns {boolean}
 */
/**
 * Stable slug for persisted bank metadata (e.g. chase, regions_bank).
 * @param {string|null|undefined} bankName
 * @returns {string|null}
 */
export function resolveBankIdFromName(bankName) {
  if (!bankName || typeof bankName !== 'string') return null;
  const norm = normalizeInstitutionName(bankName);
  if (!norm) return null;
  const slug = norm
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  const aliases = {
    chase: 'chase',
    jpmorgan_chase: 'chase',
    jpmorgan_chase_bank: 'chase',
    bank_of_america: 'bank_of_america',
    wells_fargo: 'wells_fargo',
    regions_bank: 'regions_bank',
    navy_federal_credit_union: 'navy_federal'
  };
  return aliases[slug] || slug || null;
}

export function batchConfirmationApplies(
  confirmedBankName,
  confirmedBankFileName,
  fileOriginalName,
  detectedBankName,
  normalizeInstitutionNameFn
) {
  if (!confirmedBankName) return false;

  if (confirmedBankFileName && confirmedBankFileName === fileOriginalName) {
    return true;
  }

  // Batch resume after human confirm: apply confirmed institution to undetected siblings.
  if (!detectedBankName && confirmedBankName && confirmedBankFileName) {
    return true;
  }

  if (!detectedBankName) return false;

  const confirmedNorm = normalizeInstitutionNameFn(confirmedBankName);
  const detectedNorm = normalizeInstitutionNameFn(detectedBankName);
  if (!confirmedNorm || !detectedNorm) return false;

  if (confirmedNorm === detectedNorm) return true;

  // Chase family: "JPMorgan Chase Bank, N.A." vs "Chase"
  const chaseFamily = ['chase', 'jpmorgan chase', 'jpmorgan chase bank'];
  if (
    chaseFamily.some((c) => confirmedNorm.includes(c) || c.includes(confirmedNorm)) &&
    chaseFamily.some((c) => detectedNorm.includes(c) || c.includes(detectedNorm))
  ) {
    return true;
  }

  return confirmedNorm.includes(detectedNorm) || detectedNorm.includes(confirmedNorm);
}
