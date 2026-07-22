/**
 * Profile recovery — widen regions and re-extract for Wells/Chase.
 */

import { getProfileMeta } from '../bankProfileRegistry.js';
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
  const hooks = getProfileMeta(profile?.id).recoveryHooks;
  if (hooks?.nearMiss) {
    return hooks.nearMiss({
      meta: profileResult?.meta,
      normalizedTransactions: profileResult?.normalizedTransactions,
      transactions: profileResult?.transactions,
      rows: profileResult?.rows,
      text: ctx?.text,
      altText: ctx?.altText
    });
  }
  if (hooks?.plumber && ctx?.plumberTransactions?.length) {
    return hooks.plumber({
      plumberTransactions: ctx.plumberTransactions,
      meta: profileResult?.meta,
      text: ctx.text,
      defaultYear: ctx.defaultYear,
      rtn: ctx.rtn,
      accountNumber: ctx.accountNumber,
      stitcherPrinted: ctx.stitcherPrinted,
      typeAText: ctx.typeAText
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
