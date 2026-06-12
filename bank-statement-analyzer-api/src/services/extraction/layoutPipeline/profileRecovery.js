/**
 * Profile recovery — widen regions and re-extract for Wells/Chase.
 */

import { tryRecoverWellsNearMiss } from '../profiles/wellsFargoInitiateProfile.js';
import { tryRecoverChaseFromPlumber } from '../profiles/chaseBusinessCompleteProfile.js';
import { mapProfileResultToRawBundle } from './dumbExtractorService.js';
import logger from '../../../utils/logger.js';

/**
 * @param {object} region
 * @param {number} [padLines]
 * @returns {object}
 */
export function widenTextRegion(region, padLines = 5) {
  if (!region?.text) return region;
  const lines = region.text.split(/\r?\n/);
  const pad = Math.min(padLines, 10);
  return {
    ...region,
    text: lines.slice(0, Math.min(lines.length + pad, lines.length + pad)).join('\n')
  };
}

/**
 * @param {object} params
 * @returns {object|null}
 */
export function tryProfileNearMissRecovery(params = {}) {
  const { profile, profileResult, ctx } = params;
  if (profile?.id === 'wells_initiate_checking') {
    return tryRecoverWellsNearMiss({
      meta: profileResult?.meta,
      normalizedTransactions: profileResult?.normalizedTransactions,
      transactions: profileResult?.transactions,
      rows: profileResult?.rows,
      text: ctx?.text,
      altText: ctx?.altText
    });
  }
  if (profile?.id === 'chase_business_complete' && ctx?.plumberTransactions?.length) {
    return tryRecoverChaseFromPlumber({
      plumberTransactions: ctx.plumberTransactions,
      meta: profileResult?.meta,
      stitcherPrinted: ctx.stitcherPrinted
    });
  }
  return null;
}

/**
 * @param {object} rawBundle
 * @param {object} ctx
 * @returns {Promise<object>}
 */
export async function applyProfileRecovery(rawBundle, ctx = {}) {
  const recovered = tryProfileNearMissRecovery({
    profile: ctx.profile,
    profileResult: ctx.profileResult,
    ctx
  });

  if (!recovered?.transactions?.length) {
    const widened = widenTextRegion(ctx.documentMap?.regions?.transactionHistory);
    if (widened.text !== ctx.documentMap?.regions?.transactionHistory?.text) {
      logger.info('[PROFILE_RECOVERY] widened transaction region');
    }
    return rawBundle;
  }

  logger.info('[PROFILE_RECOVERY] near-miss recovery applied', {
    profileId: ctx.profile?.id,
    txnCount: recovered.transactions.length
  });

  const mergedResult = {
    ...ctx.profileResult,
    ...recovered,
    meta: { ...(ctx.profileResult?.meta ?? {}), ...(recovered.meta ?? {}) }
  };

  return mapProfileResultToRawBundle(mergedResult, {
    ...ctx.documentMap,
    recoveryEligible: true
  });
}

export default { widenTextRegion, tryProfileNearMissRecovery, applyProfileRecovery };
