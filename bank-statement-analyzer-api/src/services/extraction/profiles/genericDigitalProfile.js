/**

 * Default digital PDF profile — stitcher Type A/B + existing pdfParserService line extraction.

 */

import { stitchStatement, mergePrintedTotals } from '../../statementStitcher.js';

import { applyLineHintSigns } from '../../../utils/statementParseQuality.js';

import { reconcileStatement } from '../statementReconciliation.js';

import {

  extractDocumentPrintedTotals,

  mergePrintedWithStitcher,

  parseSummaryLines,

  summarizePrintedLines

} from '../printedVitalsService.js';

import { getReconciliationSpec, getEffectiveReconciliationSpec } from '../reconciliationSpec.js';

import { normalizePlumberJson } from '../plumberRowNormalizer.js';

import logger from '../../../utils/logger.js';



export const PROFILE_ID = 'generic_digital';



/**

 * First-sight SUMMARY parse for an unknown bank: pull whatever printed lines the

 * minimal generic spec can match (deposits=credit, withdrawals=debit,

 * optional fees=debit) so the statement still produces printedLines + a

 * best-effort closing identity. Returns null-ish when nothing matched.

 * @param {string} text

 */

export function buildGenericPrintedLines(text, specOverride) {

  const spec = specOverride ?? getReconciliationSpec(PROFILE_ID);

  const parsed = parseSummaryLines(text, spec);

  const printedLines = parsed.printedLines ?? {};

  const aggregates = summarizePrintedLines(printedLines, spec);

  return {

    spec,

    printedLines,

    hasLines: Object.keys(printedLines).length > 0,

    openingBalance: parsed.openingBalance ?? null,

    closingBalance: parsed.closingBalance ?? null,

    printedDeposits: aggregates.printedDeposits,

    printedWithdrawals: aggregates.printedWithdrawals

  };

}



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



  const reconSpec = getEffectiveReconciliationSpec(PROFILE_ID, options?.layoutTemplate);
  const generic = buildGenericPrintedLines(text, reconSpec);

  if (balances.opening == null && generic.openingBalance != null) {

    balances.opening = generic.openingBalance;

  }

  if (balances.closing == null && generic.closingBalance != null) {

    balances.closing = generic.closingBalance;

  }



  const meta = {

    bankDisplayName: null,

    openingBalance: balances.opening,

    closingBalance: balances.closing,

    printedDeposits:

      generic.printedDeposits ?? vitals?.printedDeposits ?? mergedPrinted.totalDeposits ?? null,

    printedWithdrawals:

      generic.printedWithdrawals ?? vitals?.printedWithdrawals ?? mergedPrinted.totalWithdrawals ?? null,

    accountNumber: null,

    ...(generic.hasLines

      ? { printedLines: generic.printedLines, reconciliationSpec: generic.spec }

      : {})

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
 * Raw extraction for layout-first pipeline — no checksum gate (reconcileRawBundle handles that).
 * @param {object} ctx
 */
export async function extractRaw(ctx) {
  const {
    text,
    sectionChunks,
    parserService,
    resolvedBankType,
    defaultYear,
    plumberTransactions,
    stitcher: ctxStitcher,
    options
  } = ctx;

  const fullText = String(text || '');
  const bodyText =
    sectionChunks?.transactionHistory?.trim().length > 0
      ? sectionChunks.transactionHistory
      : fullText;

  if (!parserService?._extractTransactions) {
    const docTotals = extractDocumentPrintedTotals(fullText);
    return {
      meta: {
        extractionProfile: PROFILE_ID,
        openingBalance: docTotals?.openingBalance ?? null,
        closingBalance: docTotals?.closingBalance ?? null,
        printedDeposits: docTotals?.printedDeposits ?? null,
        printedWithdrawals: docTotals?.printedWithdrawals ?? null
      },
      transactions: [],
      normalizedTransactions: [],
      sectionChunks: {
        transactionHistory: bodyText,
        summary: sectionChunks?.summary ?? ''
      },
      stitcherPrinted: null
    };
  }

  const stitcher = ctxStitcher ?? stitchStatement(fullText);
  let txnBody = bodyText;
  if (options?.layoutTemplate?.headerAnchors) {
    txnBody = parserService._applyHeaderAnchorsMulti(txnBody, options.layoutTemplate);
  }

  let rawTransactions = await parserService._extractTransactions(
    txnBody,
    parserService.bankParsers.get(resolvedBankType) ||
      parserService.bankParsers.get('DEFAULT'),
    {
      defaultYear,
      layoutTemplate: options?.layoutTemplate,
      layoutAnchorsOnly: Boolean(options?.layoutTemplate?.layoutAnchorsOnly),
      stitcher,
      bodyText: txnBody
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
  }

  const transactions = applyLineHintSigns(Array.isArray(rawTransactions) ? rawTransactions : []);
  const balances = await parserService._extractBalances(fullText, resolvedBankType);
  const mergedPrinted = mergePrintedTotals(stitcher.typeA?.printed ?? {}, stitcher.typeA?.text || fullText);
  const docTotals = extractDocumentPrintedTotals(fullText);
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

  const generic = buildGenericPrintedLines(
    fullText,
    getEffectiveReconciliationSpec(PROFILE_ID, options?.layoutTemplate)
  );
  const reconSpec = generic.spec;
  if (balances.opening == null && generic.openingBalance != null) {
    balances.opening = generic.openingBalance;
  }
  if (balances.closing == null && generic.closingBalance != null) {
    balances.closing = generic.closingBalance;
  }

  const meta = {
    bankDisplayName: null,
    openingBalance: balances.opening,
    closingBalance: balances.closing,
    printedDeposits:
      generic.printedDeposits ?? vitals?.printedDeposits ?? mergedPrinted.totalDeposits ?? null,
    printedWithdrawals:
      generic.printedWithdrawals ?? vitals?.printedWithdrawals ?? mergedPrinted.totalWithdrawals ?? null,
    accountNumber: null,
    extractionProfile: PROFILE_ID,
    ...(generic.hasLines
      ? { printedLines: generic.printedLines, reconciliationSpec: reconSpec }
      : options?.layoutTemplate?.reconciliationSpec
        ? { reconciliationSpec: reconSpec }
        : {})
  };

  return {
    meta,
    transactions,
    normalizedTransactions: [],
    sectionChunks: {
      transactionHistory: bodyText,
      summary: sectionChunks?.summary ?? ''
    },
    stitcherPrinted: mergedPrinted,
    stitcher
  };
}



export default { PROFILE_ID, detect, extractRaw, extract };

