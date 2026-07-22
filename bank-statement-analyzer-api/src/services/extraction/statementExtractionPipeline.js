/**
 * Universal four-step bank statement extraction pipeline.
 */
import logger from '../../utils/logger.js';
import { validateEndingDailyBalancePlacement } from './statementReconciliation.js';
import { reconcileRawBundle } from './layoutPipeline/reconciliationService.js';
import { getProfileMeta } from './bankProfileRegistry.js';

/** Profile reconciliation-gate errors follow this naming convention. */
const RE_RECONCILIATION_GATE_ERROR = /ParseReconciliationError$/;

/**
 * @param {object} ctx
 * @param {string} ctx.text — full pdf-parse text
 * @param {{ id: string, extract: Function, confidence?: number }} ctx.profile
 * @param {object} [ctx.parserService]
 * @param {object} [ctx.options]
 * @param {string} [ctx.resolvedBankType]
 * @param {number} [ctx.defaultYear]
 * @returns {Promise<object>}
 */
export async function runStatementExtractionPipeline(ctx) {
  const { text, profile } = ctx;
  const started = Date.now();

  let extracted;
  try {
    if (getProfileMeta(profile.id).fullContextExtract) {
      extracted = await profile.extract(ctx);
    } else {
      extracted = await profile.extract({
        text,
        altText: ctx.altText,
        defaultYear: ctx.defaultYear
      });
    }
  } catch (e) {
    if (RE_RECONCILIATION_GATE_ERROR.test(String(e?.name || ''))) {
      logger.warn('[STATEMENT_PIPELINE] profile reconciliation gate failed', {
        profileId: profile.id,
        errorName: e.name,
        parsedDeposits: e.reconciliation?.parsedDeposits,
        printedDeposits: e.reconciliation?.printedDeposits,
        parsedWithdrawals: e.reconciliation?.parsedWithdrawals,
        printedWithdrawals: e.reconciliation?.printedWithdrawals
      });
      throw e;
    }
    logger.warn('[STATEMENT_PIPELINE] profile extract failed', {
      profileId: profile.id,
      error: e.message
    });
    throw e;
  }

  const meta = {
    ...extracted.meta,
    extractionProfile: profile.id,
    profileConfidence: ctx.profile?.confidence ?? null
  };

  let reconciliation = extracted.reconciliation;
  if (!reconciliation) {
    const reconResult = reconcileRawBundle(
      {
        transactions: extracted.transactions,
        normalizedTransactions: extracted.normalizedTransactions,
        meta,
        printedVitals: {
          opening: meta.openingBalance,
          closing: meta.closingBalance,
          deposits: meta.printedDeposits,
          withdrawals: meta.printedWithdrawals
        },
        extractionMode: 'profile_strict'
      },
      { profileId: profile.id }
    );
    reconciliation = reconResult.reconciliationBreakdown;
  }

  let dailyBalanceRule = { valid: true, violations: 0 };
  if (extracted.normalizedTransactions?.length) {
    dailyBalanceRule = validateEndingDailyBalancePlacement(extracted.normalizedTransactions);
  }

  const extractionTier = reconciliation.checksumOk && dailyBalanceRule.valid ? 1 : null;

  logger.info('[STATEMENT_PIPELINE] complete', {
    profileId: profile.id,
    txnCount: extracted.transactions?.length ?? 0,
    checksumOk: reconciliation.checksumOk,
    depositsMatch: reconciliation.depositsMatch,
    withdrawalsMatch: reconciliation.withdrawalsMatch,
    dailyBalanceValid: dailyBalanceRule.valid,
    extractionTier,
    durationMs: Date.now() - started
  });

  // Declarative plumber row passthrough: the profile's PROFILE_META names the
  // key carrying recovered plumber rows (no hardcoded per-bank fields here).
  const plumberTxnKey = getProfileMeta(profile.id).plumberTxnKey;

  return {
    meta,
    transactions: extracted.transactions,
    normalizedTransactions: extracted.normalizedTransactions,
    stitcherPrinted: extracted.stitcherPrinted,
    stitcher: extracted.stitcher,
    reconciliation,
    dailyBalanceRule,
    extractionTier,
    profileId: profile.id,
    ...(plumberTxnKey ? { [plumberTxnKey]: extracted[plumberTxnKey] ?? null } : {})
  };
}

export default { runStatementExtractionPipeline };
