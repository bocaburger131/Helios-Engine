/**
 * Pass 2a — raw profile extraction (no checksum).
 */

import { resolveProfile } from '../bankProfileRegistry.js';
import { createRawExtractionBundle, createContextArchive } from './documentMapContract.js';
import { extractFeeLedgerTransactions, dedupeFeeTransactions } from './feeLedgerParser.js';
import { applyProfileRecovery } from './profileRecovery.js';
import logger from '../../../utils/logger.js';

/**
 * @param {object} profileResult — output from profile extractRaw
 * @param {object} documentMap
 * @returns {ReturnType<typeof createRawExtractionBundle>}
 */
export function mapProfileResultToRawBundle(profileResult, documentMap) {
  const feeText = documentMap?.regions?.fee_ledger?.text ?? '';
  const feeTransactions = extractFeeLedgerTransactions(feeText, {
    defaultYear: profileResult?.meta?.statementYear
  });
  const dedupedFees = dedupeFeeTransactions(
    feeTransactions,
    profileResult?.transactions ?? []
  );

  const contextArchive = createContextArchive({ documentMap });

  return createRawExtractionBundle({
    extractionMode: 'profile_strict',
    profileId: profileResult?.meta?.extractionProfile ?? documentMap?.profileId,
    transactions: profileResult?.transactions ?? [],
    feeTransactions: dedupedFees,
    normalizedTransactions: profileResult?.normalizedTransactions ?? [],
    meta: profileResult?.meta ?? {},
    sectionChunks: profileResult?.sectionChunks ?? {},
    stitcherPrinted: profileResult?.stitcherPrinted ?? null,
    documentMap,
    identityMap: documentMap?.identity,
    contextArchive
  });
}

/**
 * @param {object} documentMap
 * @param {object} ctx
 * @returns {Promise<ReturnType<typeof createRawExtractionBundle>>}
 */
export async function extractRaw(documentMap, ctx = {}) {
  const profile = resolveProfile({
    text: ctx.text,
    profileId: documentMap.profileId
  });

  const sectionChunks = {
    summary: documentMap.regions?.summary?.text ?? '',
    transactionHistory: documentMap.regions?.transactionHistory?.text ?? '',
    fee_ledger: documentMap.regions?.fee_ledger?.text ?? ''
  };

  const extractFn = profile.extractRaw ?? profile.extract;
  if (typeof extractFn !== 'function') {
    throw new Error(`Profile ${profile.id} has no extractRaw`);
  }

  let profileResult = await extractFn({
    text: ctx.text,
    altText: ctx.altText,
    defaultYear: ctx.defaultYear,
    sectionChunks,
    parserService: ctx.parserService,
    resolvedBankType: ctx.resolvedBankType,
    plumberTransactions: ctx.plumberTransactions,
    rtn: ctx.rtn,
    accountNumber: ctx.accountNumber,
    stitcherPrinted: ctx.stitcherPrinted,
    typeAText: ctx.typeAText,
    stitcher: ctx.stitcher,
    options: {
      layoutTemplate: ctx.layoutTemplate,
      fileName: ctx.fileName
    }
  });

  let bundle = mapProfileResultToRawBundle(profileResult, documentMap);

  if (documentMap.recoveryEligible) {
    bundle = await applyProfileRecovery(bundle, {
      documentMap,
      ...ctx,
      profile,
      profileResult
    });
  }

  logger.info('[DUMB_EXTRACTOR] raw bundle', {
    profileId: bundle.profileId,
    txnCount: bundle.transactions.length,
    feeCount: bundle.feeTransactions.length,
    mode: bundle.extractionMode
  });

  return bundle;
}

export default { mapProfileResultToRawBundle, extractRaw };
