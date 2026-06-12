/**
 * Layout-first two-pass orchestrator.
 */

import logger from '../../../utils/logger.js';
import { logStructured } from '../../../utils/structuredLog.js';
import { buildDocumentMap } from './layoutMapperService.js';
import { extractRaw } from './dumbExtractorService.js';
import { reconcileRawBundle } from './reconciliationService.js';
import { crossCheckIdentity, reconcileWithVera } from './veraReconciliationFallback.js';
import { tryProfileNearMissRecovery } from './profileRecovery.js';
import { createContextArchive } from './documentMapContract.js';

/**
 * @param {Buffer} buffer — retained for API compat; Pass 1 uses ctx.text not full re-parse
 * @param {object} ctx
 * @returns {Promise<object>}
 */
export async function runLayoutFirstPipeline(buffer, ctx = {}) {
  const correlationId = ctx.correlationId ?? null;

  const documentMap = buildDocumentMap({
    text: ctx.text,
    altText: ctx.altText,
    rtn: ctx.rtn,
    bankName: ctx.bankName,
    profileId: ctx.profileId,
    pageCount: ctx.pageCount,
    layoutTemplate: ctx.layoutTemplate,
    stitcher: ctx.stitcher ?? null
  });

  let rawBundle = await extractRaw(documentMap, ctx);
  let reconciliation = reconcileRawBundle(rawBundle);

  if (!reconciliation.checksumOk) {
    const recovered = tryProfileNearMissRecovery({
      profile: { id: documentMap.profileId },
      profileResult: {
        meta: rawBundle.meta,
        normalizedTransactions: rawBundle.normalizedTransactions,
        transactions: rawBundle.transactions
      },
      ctx
    });
    if (recovered?.transactions?.length) {
      rawBundle = {
        ...rawBundle,
        extractionMode: 'profile_recovery',
        transactions: recovered.transactions,
        normalizedTransactions:
          recovered.normalizedTransactions ?? rawBundle.normalizedTransactions
      };
      reconciliation = reconcileRawBundle(rawBundle);
    }
  }

  let veraFallback = null;
  if (ctx.enableVeraFallback && !reconciliation.checksumOk) {
    veraFallback = await reconcileWithVera({
      rawBundle,
      reconciliation,
      sectionChunks: rawBundle.sectionChunks,
      diagnosticFn: ctx.diagnosticFn ?? null,
      correlationId
    });
    if (veraFallback?.applied && veraFallback.reconciliation) {
      reconciliation = veraFallback.reconciliation;
      if (veraFallback.patchedMeta) {
        rawBundle = { ...rawBundle, meta: veraFallback.patchedMeta };
      }
    }
  }

  const identityCrossCheck = crossCheckIdentity(
    documentMap,
    ctx.applicationContext ?? ctx.anchorData ?? {}
  );

  const result = {
    profileId: rawBundle.profileId ?? documentMap.profileId,
    extractionTier: rawBundle.extractionMode === 'profile_recovery' ? 2 : 1,
    transactions: rawBundle.transactions,
    feeTransactions: rawBundle.feeTransactions,
    normalizedTransactions: rawBundle.normalizedTransactions,
    meta: rawBundle.meta,
    documentMap,
    identityMap: identityCrossCheck.identityMap,
    contextArchive:
      rawBundle.contextArchive ?? createContextArchive({ documentMap }),
    rawBundle,
    reconciliation,
    identityCrossCheck,
    veraFallback,
    layoutPipelineShadow: null
  };

  logStructured('info', 'layout_pipeline_complete', {
    event: 'layout_pipeline_complete',
    correlationId,
    profileId: result.profileId,
    txnCount: result.transactions.length,
    feeCount: result.feeTransactions.length,
    checksumOk: reconciliation.checksumOk
  });

  logger.info('[LAYOUT_FIRST] pipeline complete', {
    profileId: result.profileId,
    txnCount: result.transactions.length,
    checksumOk: reconciliation.checksumOk
  });

  return result;
}

export default { runLayoutFirstPipeline };
