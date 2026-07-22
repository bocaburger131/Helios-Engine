/**
 * Vera reconciliation fallback + identity cross-check (section-scoped, no full PDF re-parse).
 */

import logger from '../../../utils/logger.js';
import { fuzzyMatch } from '../../../utils/stringUtils.js';
import { reconcileRawBundle } from './reconciliationService.js';
import { normalizeIdentityMap } from './documentMapContract.js';
import { isInstitutionBleedName } from './identityParser.js';

export const AUTO_FIX_CONFIDENCE = 0.85;

/**
 * @param {object} documentMap
 * @param {object} applicationContext
 * @returns {object}
 */
export function crossCheckIdentity(documentMap, applicationContext = {}) {
  const identity = normalizeIdentityMap(documentMap?.identity ?? {});
  const appName =
    applicationContext.companyName ||
    applicationContext.businessName ||
    applicationContext.dbaName ||
    '';
  const appEin = String(applicationContext.taxId || applicationContext.ein || '').replace(/\D/g, '');
  const stmtEin = String(identity.ein || '').replace(/\D/g, '');

  const mismatches = [];
  let confidence = 1;

  if (appName && identity.legalName) {
    if (isInstitutionBleedName(identity.legalName)) {
      return {
        status: 'pass',
        mismatches: [],
        confidence: 0.85,
        bankBleedSkipped: true,
        displayName: appName,
        identityMap: normalizeIdentityMap({ ...identity, legalName: appName }),
        note:
          'Statement header matched bank letterhead; using application company name for cross-check.'
      };
    }
    const score = fuzzyMatch(appName, identity.legalName);
    if (score < 0.72) {
      mismatches.push({
        field: 'companyName',
        expected: appName,
        observed: identity.legalName,
        score
      });
      confidence = Math.min(confidence, score);
    }
  }

  if (appEin && stmtEin && appEin !== stmtEin) {
    mismatches.push({ field: 'ein', expected: appEin, observed: stmtEin });
    confidence = Math.min(confidence, 0.3);
  }

  let status = 'pass';
  if (mismatches.length > 0) status = confidence < 0.5 ? 'mismatch' : 'review';

  return {
    status,
    mismatches,
    confidence: Number(confidence.toFixed(2)),
    identityMap: identity
  };
}

/**
 * Section-scoped Vera reconciliation — never re-parses full PDF.
 * @param {object} params
 * @returns {Promise<object>}
 */
export async function reconcileWithVera(params = {}) {
  const {
    rawBundle,
    reconciliation,
    sectionChunks = {},
    diagnosticFn = null,
    correlationId = null
  } = params;

  const delta = reconciliation?.delta ?? {};
  const sectionText = [
    sectionChunks.summary,
    sectionChunks.transactionHistory,
    sectionChunks.fee_ledger
  ]
    .filter(Boolean)
    .join('\n---\n')
    .slice(0, 6000);

  const basePayload = {
    applied: false,
    deltaFixes: [],
    correlationId,
    veraCallType: 'reconciliation_fallback',
    sectionCount: Object.keys(sectionChunks).length
  };

  if (reconciliation?.checksumOk) {
    return { ...basePayload, skipped: true, reason: 'checksum_ok' };
  }

  if (typeof diagnosticFn !== 'function') {
    logger.info('[VERA_FALLBACK] no diagnosticFn — skipping AI fix', { correlationId });
    return { ...basePayload, skipped: true, reason: 'no_diagnostic_fn' };
  }

  const started = Date.now();
  const aiResult = await diagnosticFn({
    checksumDelta: delta,
    sectionText,
    feeTransactions: rawBundle?.feeTransactions ?? [],
    meta: rawBundle?.meta ?? {}
  });

  logger.info('[VERA_FALLBACK] diagnostic complete', {
    correlationId,
    durationMs: Date.now() - started,
    veraCallType: 'reconciliation_fallback',
    sectionCount: basePayload.sectionCount,
    fixCount: aiResult?.fixes?.length ?? 0
  });

  const fixes = (aiResult?.fixes ?? []).filter(
    (f) => Number(f.confidence) >= AUTO_FIX_CONFIDENCE
  );

  if (!fixes.length) {
    return { ...basePayload, deltaFixes: aiResult?.fixes ?? [] };
  }

  const patchedMeta = { ...(rawBundle.meta ?? {}) };
  for (const fix of fixes) {
    if (fix.field === 'printedDeposits' && fix.proposedValue != null) {
      patchedMeta.printedDeposits = Number(fix.proposedValue);
    }
    if (fix.field === 'printedWithdrawals' && fix.proposedValue != null) {
      patchedMeta.printedWithdrawals = Number(fix.proposedValue);
    }
    if (fix.field === 'closingBalance' && fix.proposedValue != null) {
      patchedMeta.closingBalance = Number(fix.proposedValue);
    }
  }

  const reRecon = reconcileRawBundle({ ...rawBundle, meta: patchedMeta });

  return {
    ...basePayload,
    applied: reRecon.checksumOk,
    deltaFixes: aiResult?.fixes ?? [],
    reconciliation: reRecon,
    patchedMeta
  };
}

export default { crossCheckIdentity, reconcileWithVera, AUTO_FIX_CONFIDENCE };
