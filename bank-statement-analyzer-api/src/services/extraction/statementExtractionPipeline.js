/**
 * Universal four-step bank statement extraction pipeline.
 */
import logger from '../../utils/logger.js';
import { validateEndingDailyBalancePlacement } from './statementReconciliation.js';
import { reconcileRawBundle } from './layoutPipeline/reconciliationService.js';
import { WellsParseReconciliationError } from './profiles/wellsFargoInitiateProfile.js';
import { ChaseParseReconciliationError } from './profiles/chaseBusinessCompleteProfile.js';
import {
  extractTransactionsFromPdfBuffer as ocrExtractFromBuffer,
  scanOcrEnabled
} from './scanOcrService.js';

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
    if (profile.id === 'generic_digital' || profile.id === 'chase_business_complete') {
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

  // ── OCR rescue pass ────────────────────────────────────────────────────────
  // If the primary extraction failed checksum and we have the raw buffer,
  // attempt a second pass through the OCR/scan pipeline.  If OCR produces a
  // result that passes reconciliation we swap it in; otherwise we keep the
  // original (non-fatal).
  let ocrRescueApplied = false;
  let ocrRescueFailed = false;

  if (!reconciliation.checksumOk && ctx.pdfBuffer && scanOcrEnabled()) {
    logger.info('[STATEMENT_PIPELINE] checksum failed — attempting OCR rescue', {
      profileId: profile.id,
      txnCount: extracted.transactions?.length ?? 0
    });

    try {
      const ocrResult = await ocrExtractFromBuffer(ctx.pdfBuffer, {
        bankName: ctx.resolvedBankType || '',
        defaultYear: ctx.defaultYear,
        fileName: ctx.options?.fileName
      });

      if (ocrResult?.success && ocrResult.transactions?.length) {
        const ocrBundle = reconcileRawBundle(
          {
            transactions: ocrResult.transactions,
            normalizedTransactions: ocrResult.normalizedTransactions ?? ocrResult.transactions,
            meta: {
              openingBalance: ocrResult.openingBalance,
              closingBalance: ocrResult.closingBalance
            },
            printedVitals: {
              opening: ocrResult.openingBalance,
              closing: ocrResult.closingBalance,
              deposits: null,
              withdrawals: null
            },
            extractionMode: 'ocr_rescue'
          },
          { profileId: profile.id }
        );

        if (ocrBundle.reconciliationBreakdown?.checksumOk) {
          // OCR pass succeeded — swap in its result
          extracted = {
            ...extracted,
            transactions: ocrResult.transactions,
            normalizedTransactions: ocrResult.normalizedTransactions ?? ocrResult.transactions
          };
          reconciliation = ocrBundle.reconciliationBreakdown;
          ocrRescueApplied = true;
          logger.info('[STATEMENT_PIPELINE] OCR rescue succeeded', {
            profileId: profile.id,
            txnCount: ocrResult.transactions.length
          });
        } else {
          ocrRescueFailed = true;
          logger.warn('[STATEMENT_PIPELINE] OCR rescue did not pass checksum', {
            profileId: profile.id
          });
        }
      } else {
        ocrRescueFailed = true;
        logger.warn('[STATEMENT_PIPELINE] OCR rescue returned no transactions', {
          profileId: profile.id,
          error: ocrResult?.error
        });
      }
    } catch (ocrErr) {
      ocrRescueFailed = true;
      logger.warn('[STATEMENT_PIPELINE] OCR rescue threw', {
        profileId: profile.id,
        error: ocrErr.message
      });
    }
  }
  // ── end OCR rescue ─────────────────────────────────────────────────────────

  logger.info('[STATEMENT_PIPELINE] complete', {
    profileId: profile.id,
    txnCount: extracted.transactions?.length ?? 0,
    checksumOk: reconciliation.checksumOk,
    depositsMatch: reconciliation.depositsMatch,
    withdrawalsMatch: reconciliation.withdrawalsMatch,
    dailyBalanceValid: dailyBalanceRule.valid,
    extractionTier,
    ocrRescueApplied,
    ocrRescueFailed,
    durationMs: Date.now() - started
  });

  return {
    meta: {
      ...meta,
      ocrRescueApplied,
      ocrRescueFailed
    },
    transactions: extracted.transactions,
    normalizedTransactions: extracted.normalizedTransactions,
    stitcherPrinted: extracted.stitcherPrinted,
    stitcher: extracted.stitcher,
    reconciliation,
    dailyBalanceRule,
    extractionTier,
    profileId: profile.id,
    chasePlumberTransactions: extracted.chasePlumberTransactions ?? null
  };
}

export default { runStatementExtractionPipeline };
