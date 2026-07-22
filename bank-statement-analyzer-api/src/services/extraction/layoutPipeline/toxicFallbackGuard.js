/**
 * Block toxic legacy fallback for strict layout-first profiles.
 */

import { getProfileMeta, listTier1ProfileIds } from '../bankProfileRegistry.js';
import logger from '../../../utils/logger.js';

let strictIdsCache = null;

/** Derived from PROFILE_META (strictProfile flag) — never hardcode profile IDs here. */
export function getStrictProfileIds() {
  if (!strictIdsCache) strictIdsCache = Object.freeze(listTier1ProfileIds());
  return strictIdsCache;
}

/**
 * @param {object} params
 * @returns {boolean}
 */
export function shouldBlockLegacyExtract(params = {}) {
  const { profileId, profileRowsRetained, rawBundle } = params;
  const meta = getProfileMeta(profileId);
  if (meta.blockLegacyFallback !== true) {
    return false;
  }
  if (profileRowsRetained > 0) return false;
  if (rawBundle?.extractionMode === 'profile_recovery' && rawBundle?.transactions?.length > 0) {
    return false;
  }
  return true;
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

export default { getStrictProfileIds, shouldBlockLegacyExtract, logToxicFallbackBlocked };
