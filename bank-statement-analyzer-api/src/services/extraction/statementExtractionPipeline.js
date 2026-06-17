/**
 * Universal four-step bank statement extraction pipeline.
 */
import logger from '../../utils/logger.js';
import { validateEndingDailyBalancePlacement } from './statementReconciliation.js';
import { reconcileRawBundle } from './layoutPipeline/reconciliationService.js';
import { WellsParseReconciliationError } from './profiles/wellsFargoInitiateProfile.js';
import { ChaseParseReconciliationError } from './profiles/chaseBusinessCompleteProfile.js';
import { RegionsParseReconciliationError } from './profiles/regionsBusinessCheckingProfile.js';

const FULL_CTX_PROFILE_IDS = new Set([
  'generic_digital',
  'chase_business_complete',
  'regions_business_checking'
]);

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
    if (FULL_CTX_PROFILE_IDS.has(profile.id)) {
      extracted = await profile.extract(ctx);
    } else {
      extracted = await profile.extract({
        text,
        altText: ctx.altText,
        defaultYear: ctx.defaultYear
      });
    }
  } catch (e) {
    if (e instanceof WellsParseReconciliationError) {
      logger.warn('[STATEMENT_PIPELINE] Wells reconciliation gate failed', {
        profileId: profile.id,
        parsedDeposits: e.reconciliation?.parsedDeposits,
        printedDeposits: e.reconciliation?.printedDeposits
      });
      throw e;
    }
    if (e instanceof ChaseParseReconciliationError) {
      logger.warn('[STATEMENT_PIPELINE] Chase reconciliation gate failed', {
        profileId: profile.id,
        parsedDeposits: e.reconciliation?.parsedDeposits,
        printedDeposits: e.reconciliation?.printedDeposits
      });
      throw e;
    }
    if (e instanceof RegionsParseReconciliationError) {
      logger.warn('[STATEMENT_PIPELINE] Regions reconciliation gate failed', {
        profileId: profile.id,
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
    chasePlumberTransactions: extracted.chasePlumberTransactions ?? null,
    regionsPlumberTransactions: extracted.regionsPlumberTransactions ?? null
  };
}

export default { runStatementExtractionPipeline };
