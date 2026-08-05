/**
 * Block toxic legacy fallback for strict layout-first profiles.
 */

import { getProfileMeta } from '../bankProfileRegistry.js';
import logger from '../../../utils/logger.js';

export const STRICT_PROFILE_IDS = Object.freeze([
  'wells_initiate_checking',
  'chase_business_complete',
  'regions_business_checking'
]);

/**
 * @param {object} params
 * @returns {boolean}
 */
export function shouldBlockLegacyExtract(params = {}) {
  const { profileId, profileRowsRetained, rawBundle } = params;
  const meta = getProfileMeta(profileId);
  if (!meta.blockLegacyFallback && !STRICT_PROFILE_IDS.includes(profileId)) {
    return false;
  }
  if (profileRowsRetained > 0) return false;
  if (rawBundle?.extractionMode === 'profile_recovery' && rawBundle?.transactions?.length > 0) {
    return false;
  }
  return STRICT_PROFILE_IDS.includes(profileId) || meta.blockLegacyFallback === true;
}

/**
 * @param {object} params
 */
export function logToxicFallbackBlocked(params = {}) {
  logger.warn('[TOXIC_FALLBACK_GUARD] blocked legacy extract', {
    profileId: params.profileId,
    txnCount: params.transactions?.length ?? 0,
    mode: params.rawBundle?.extractionMode ?? null
  });
}

export default { STRICT_PROFILE_IDS, shouldBlockLegacyExtract, logToxicFallbackBlocked };
