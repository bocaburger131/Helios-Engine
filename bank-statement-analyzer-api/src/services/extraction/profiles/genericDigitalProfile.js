/**

 * Default digital PDF profile — stitcher Type A/B + existing pdfParserService line extraction.

 */

import { stitchStatement, mergePrintedTotals } from '../../statementStitcher.js';

import { applyLineHintSigns } from '../../../utils/statementParseQuality.js';

import { reconcileStatement } from '../statementReconciliation.js';

import {

  extractDocumentPrintedTotals,

  mergePrintedWithStitcher

} from '../printedVitalsService.js';

import { normalizePlumberJson } from '../plumberRowNormalizer.js';

import logger from '../../../utils/logger.js';



export const PROFILE_ID = 'generic_digital';



export function detect() {

  return 0.1;

}



/**

 * @param {object} ctx

 * @param {string} ctx.text

 * @param {object} ctx.parserService — PDFParserService instance

 * @param {string} ctx.resolvedBankType

 * @param {object} ctx.options

 * @param {number} ctx.defaultYear

 * @param {object[]} [ctx.plumberTransactions]

 */

export async function extract(ctx) {

  const { text, parserService, resolvedBankType, options, defaultYear, plumberTransactions } = ctx;

  const stitcher = stitchStatement(text);



  let bodyText =

    stitcher.typeB.combinedText?.trim().length > 0 ? stitcher.typeB.combinedText : text;

  if (options?.layoutTemplate?.headerAnchors) {

    bodyText = parserService._applyHeaderAnchorsMulti(bodyText, options.layoutTemplate);

  }



  let rawTransactions = await parserService._extractTransactions(

    bodyText,

    parserService.bankParsers.get(resolvedBankType) ||

      parserService.bankParsers.get('DEFAULT'),

    {

      defaultYear,

      layoutTemplate: options?.layoutTemplate,

      layoutAnchorsOnly: Boolean(options?.layoutTemplate?.layoutAnchorsOnly),

      stitcher,

      bodyText

    }

  );



  if (

    (!rawTransactions || rawTransactions.length === 0) &&

    Array.isArray(plumberTransactions) &&

    plumberTransactions.length > 0

  ) {

    const { transactions: plumberNorm } = normalizePlumberJson(

      { transactions: plumberTransactions },

      defaultYear

    );

    rawTransactions = plumberNorm;

    logger.info('[GENERIC_DIGITAL] adopted pdfplumber rows (text path empty)', {

      txnCount: plumberNorm.length

    });

  }



  const transactions = applyLineHintSigns(rawTransactions);



  const balances = await parserService._extractBalances(text, resolvedBankType);

  const mergedPrinted = mergePrintedTotals(stitcher.typeA.printed ?? {}, stitcher.typeA.text || text);

  const docTotals = extractDocumentPrintedTotals(text);

  const vitals = mergePrintedWithStitcher(

    {

      openingBalance: balances.opening,

      closingBalance: balances.closing,

      printedDeposits: docTotals?.printedDeposits ?? null,

      printedWithdrawals: docTotals?.printedWithdrawals ?? null

    },

    mergedPrinted

  );



  if (vitals?.openingBalance != null) balances.opening = vitals.openingBalance;

  if (vitals?.closingBalance != null) balances.closing = vitals.closingBalance;



  const meta = {

    bankDisplayName: null,

    openingBalance: balances.opening,

    closingBalance: balances.closing,

    printedDeposits: vitals?.printedDeposits ?? mergedPrinted.totalDeposits ?? null,

    printedWithdrawals: vitals?.printedWithdrawals ?? mergedPrinted.totalWithdrawals ?? null,

    accountNumber: null

  };



  const reconciliation = reconcileStatement(meta, transactions);

  const hasPrintedTotals =

    meta.printedDeposits != null || meta.printedWithdrawals != null;



  if (hasPrintedTotals && !reconciliation.checksumOk && transactions.length > 0) {

    logger.warn('[GENERIC_DIGITAL] checksum failed — best-effort analysis (keeping rows)', {

      parsedDeposits: reconciliation.parsedDeposits,

      printedDeposits: reconciliation.printedDeposits,

      parsedWithdrawals: reconciliation.parsedWithdrawals,

      printedWithdrawals: reconciliation.printedWithdrawals,

      txnCount: transactions.length

    });

  }



  logger.info('[GENERIC_DIGITAL] extracted', {

    txnCount: transactions.length,

    printedDeposits: meta.printedDeposits,

    checksumOk: reconciliation.checksumOk

  });



  return {

    meta,

    normalizedTransactions: [],

    transactions,

    reconciliation,

    stitcherPrinted: mergedPrinted,

    stitcher

  };

}



/**
 * Raw extraction stub — delegates to extract path without legacy fallbacks in layout pipeline.
 * @param {object} ctx
 */
export async function extractRaw(ctx) {
  const result = await extract(ctx);
  return {
    meta: result.meta,
    transactions: result.transactions,
    normalizedTransactions: result.normalizedTransactions,
    sectionChunks: {
      transactionHistory: ctx.sectionChunks?.transactionHistory ?? '',
      summary: ctx.sectionChunks?.summary ?? ''
    },
    stitcherPrinted: result.stitcherPrinted,
    stitcher: result.stitcher
  };
}



export default { PROFILE_ID, detect, extractRaw, extract };

