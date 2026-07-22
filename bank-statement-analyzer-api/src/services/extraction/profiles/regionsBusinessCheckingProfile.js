/**
 * Regions Bank business checking — section-scoped extraction with printed summary reconciliation.
 */

import { normalizeTransactionForLedger } from '../../../utils/transactionNormalization.js';
import { reconcileStatement } from '../statementReconciliation.js';
import {
  extractDocumentPrintedTotals,
  mergePrintedWithStitcher,
  parseSummaryLines,
  summarizePrintedLines
} from '../printedVitalsService.js';
import { getReconciliationSpec } from '../reconciliationSpec.js';
import {
  parseRegionsSections,
  enforceSectionTotal,
  REGIONS_SECTIONS
} from './regionsSectionExtractor.js';
import { mergePrintedTotals, stitchStatement } from '../../statementStitcher.js';
import { normalizePlumberJson } from '../plumberRowNormalizer.js';
import logger from '../../../utils/logger.js';

export const PROFILE_ID = 'regions_business_checking';

const MONEY_RE = /\$?\s*([\d,]+\.\d{2})/;
const ROUTING_BLEED_RE = /\b\d{8,}\b/;
const MONEY_TOKEN_RE = /\d{1,3}(?:,\d{3})*\.\d{2}/g;

export class RegionsParseReconciliationError extends Error {
  constructor(reconciliation) {
    super('Regions Business Checking: reconciliation failed against printed monthly totals');
    this.name = 'RegionsParseReconciliationError';
    this.reconciliation = reconciliation;
  }
}

export function detect(text) {
  const t = String(text || '');
  if (!/\bregions\b/i.test(t) && !/\b062000019\b/.test(t)) {
    return 0;
  }
  let score = 0.82;
  if (/electronic\s+deposits?/i.test(t)) score += 0.04;
  if (/checks?\s+cleared/i.test(t)) score += 0.03;
  if (/beginning\s+balance/i.test(t) && /\bSUMMARY\b/i.test(t)) score += 0.04;
  if (/deposits?\s*(?:&|and)\s*credits?/i.test(t)) score += 0.03;
  return Math.min(score, 1);
}

function inferStatementYear(text) {
  const m = String(text || '').match(/\b(20\d{2})\b/g);
  if (!m?.length) return new Date().getFullYear();
  return Number(m[m.length - 1]);
}

function extractAccountNumber(text) {
  const m = String(text || '').match(/account\s*(?:#|number)?\s*[:\s]*(\d{6,12})/i);
  return m ? m[1] : null;
}

function parseMoneyToken(raw) {
  const m = String(raw || '').match(MONEY_RE);
  if (!m) return null;
  const n = Number(String(m[1]).replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
}

/**
 * @param {string} text
 * @param {object} [opts]
 */
export function buildRegionsSummaryMeta(text, opts = {}) {
  const full = String(text || '');
  const mergedPrinted = mergePrintedTotals(opts.stitcherPrinted ?? {}, opts.typeAText || full);
  const docTotals = extractDocumentPrintedTotals(full);

  // Multi-line SUMMARY: Deposits & Credits / Withdrawals / Checks / Fees /
  // Returned Checks / Automatic Transfers — each captured as a printedLine and
  // collapsed into legacy two-bucket aggregates by credit/debit role.
  const spec = getReconciliationSpec(PROFILE_ID);
  const parsed = parseSummaryLines(full, spec);
  const printedLines = parsed.printedLines ?? {};
  const aggregates = summarizePrintedLines(printedLines, spec);

  const opening =
    parsed.openingBalance ??
    docTotals?.openingBalance ??
    parseMoneyToken(
      full.match(/beginning balance(?:\s+on\s+\d{1,2}\/\d{1,2})?\s*\$?\s*([\d,]+\.\d{2})/i)?.[1]
    );
  const closing =
    parsed.closingBalance ??
    docTotals?.closingBalance ??
    parseMoneyToken(
      full.match(/ending balance(?:\s+on\s+\d{1,2}\/\d{1,2})?\s*\$?\s*([\d,]+\.\d{2})/i)?.[1]
    );
  const printedDeposits =
    aggregates.printedDeposits ??
    docTotals?.printedDeposits ??
    parseMoneyToken(
      full.match(/deposits?\s*(?:&|and)\s*credits?\s*\$?\s*([\d,]+\.\d{2})/i)?.[1]
    );
  // Plain "Withdrawals" (no "/ Debits"); aggregate includes checks + fees.
  const printedWithdrawals =
    aggregates.printedWithdrawals ??
    docTotals?.printedWithdrawals ??
    parseMoneyToken(
      full.match(/withdrawals?\s*(?:\/|and)?\s*(?:debits?)?\s*-?\s*\$?\s*([\d,]+\.\d{2})/i)?.[1]
    );

  const vitals = mergePrintedWithStitcher(
    { openingBalance: opening, closingBalance: closing, printedDeposits, printedWithdrawals },
    mergedPrinted
  );

  if (vitals?.openingBalance == null && vitals?.closingBalance == null) {
    return null;
  }

  return {
    openingBalance: vitals.openingBalance,
    closingBalance: vitals.closingBalance,
    printedDeposits: vitals.printedDeposits,
    printedWithdrawals: vitals.printedWithdrawals,
    printedLines,
    reconciliationSpec: spec
  };
}

export function mapToLedgerTransactions(normalized) {
  return (normalized || [])
    .filter((t) => t.amount != null && Number.isFinite(t.amount) && t.amount !== 0)
    .map((t) =>
      normalizeTransactionForLedger({
        date: t.postedDate ?? t.date,
        description: t.description,
        amount: t.amount,
        type: t.amount >= 0 ? 'CREDIT' : 'DEBIT',
        rawLine: t.rawLine,
        extractionSource: PROFILE_ID,
        sectionLabel: t.section
      })
    );
}

function rejectBleedRow(row) {
  const desc = String(row.description || '');
  const absAmt = Math.abs(Number(row.amount) || 0);
  // Long digit runs are normal ACH/MCC/trace refs. Only treat as bleed when
  // paired with an implausibly large amount (same bar as plumberRowNormalizer).
  if (ROUTING_BLEED_RE.test(desc) && absAmt > 25_000) return true;
  // Bleed = a date with 3+ digits after the slash (day glued to trailing
  // numbers, e.g. "12/051234"). A clean "MM/DD" must NOT be rejected.
  if (/^\d{1,2}\/\d{3,}/.test(String(row.dateRaw || ''))) return true;
  // Amount tokens left in the description usually mean column bleed
  // (balance/amount glued into the memo). Keep rows with a single token.
  const moneyTokens = desc.match(MONEY_TOKEN_RE);
  if (moneyTokens && moneyTokens.length >= 2) return true;
  // Daily-balance grid bleed: short numeric noise + large amount.
  if (/^\d{1,4}(\s+\d{1,4}){0,3}$/.test(desc.trim()) && absAmt > 1000) {
    return true;
  }
  return false;
}

function isPlumberChecksSection(row) {
  const s = String(row.section || row.sectionLabel || '').toLowerCase();
  return s === 'checks' || s === 'checkspaid' || /^checks?\b/.test(s);
}

function mapPlumberRowsToRegionsNormalized(plumberTransactions, defaultYear, printedLines = null) {
  const { transactions } = normalizePlumberJson({ transactions: plumberTransactions }, defaultYear);
  // Text CHECKS grid is authoritative; drop plumber check rows to avoid double-count.
  let rows = transactions.filter((t) => !rejectBleedRow(t) && !isPlumberChecksSection(t));
  if (!printedLines) return rows;

  const deposits = [];
  const withdrawals = [];
  const other = [];
  for (const t of rows) {
    const s = String(t.section || '').toLowerCase();
    if (s === 'deposits' || s === 'electronic_deposits') deposits.push(t);
    else if (
      s === 'withdrawals' ||
      s === 'other_withdrawals' ||
      s === 'fees' ||
      s === 'atm_debit' ||
      s === 'card'
    ) {
      withdrawals.push(t);
    } else {
      other.push(t);
    }
  }
  return [
    ...enforceSectionTotal(deposits, printedLines.deposits),
    ...enforceSectionTotal(withdrawals, printedLines.withdrawals),
    ...other
  ];
}

/** Ledger-shaped CHECKS grid rows (signed debits, section-tagged). */
export function buildRegionsChecksLedger(text, year) {
  const { bySection } = parseRegionsSections(String(text || ''), year);
  return mapToLedgerTransactions(bySection?.[REGIONS_SECTIONS.CHECKS] ?? []);
}

/** Returned checks (credits) + fees (debits) from labeled text sections. */
export function buildRegionsSupplementalLedgers(text, year) {
  const { bySection } = parseRegionsSections(String(text || ''), year);
  return {
    checks: mapToLedgerTransactions(bySection?.[REGIONS_SECTIONS.CHECKS] ?? []),
    returnedChecks: mapToLedgerTransactions(
      bySection?.[REGIONS_SECTIONS.RETURNED_CHECKS] ?? []
    ),
    fees: mapToLedgerTransactions(bySection?.[REGIONS_SECTIONS.FEES] ?? [])
  };
}

/** Merge check/returned/fee rows into a ledger; dedupe by date + amount + desc. */
function appendSupplementalLedgers(ledger, text, year) {
  const { checks, returnedChecks, fees } = buildRegionsSupplementalLedgers(text, year);
  let out = appendChecksLedger(ledger, checks);
  out = appendChecksLedger(out, returnedChecks);
  out = appendChecksLedger(out, fees);
  return out;
}

/** Dedupe key for check rows — includes check number when available. */
function checkDedupeKey(t) {
  const checkNo =
    t.checkNo ??
    (String(t.description || '').match(/Check\s+#?(\d+)/i) || [])[1] ??
    null;
  const date = t.date ?? t.postedDate ?? '';
  const amt = Math.abs(Number(t.amount) || 0).toFixed(2);
  if (checkNo) return `${date}|check|${checkNo}|${amt}`;
  const desc = String(t.description || '')
    .slice(0, 40)
    .toLowerCase();
  return `${date}|${amt}|${desc}`;
}

/** Merge check rows into a ledger; dedupe by check number + date + amount. */
function appendChecksLedger(ledger, checksLedger) {
  if (!checksLedger?.length) return ledger;
  const seen = new Set((ledger ?? []).map(checkDedupeKey));
  const additions = checksLedger.filter((t) => !seen.has(checkDedupeKey(t)));
  return [...(ledger ?? []), ...additions];
}

/**
 * Tier B recovery: accept pdfplumber rows only when reconcileStatement passes.
 */
export function tryRecoverRegionsFromPlumber(params = {}) {
  const {
    plumberTransactions,
    text,
    defaultYear,
    rtn,
    accountNumber,
    stitcherPrinted,
    typeAText
  } = params;
  if (!Array.isArray(plumberTransactions) || plumberTransactions.length === 0) {
    return null;
  }

  const fullText = String(text || '');
  const summary = buildRegionsSummaryMeta(fullText, { stitcherPrinted, typeAText });
  if (!summary) return null;

  const year = defaultYear ?? inferStatementYear(fullText);
  const meta = {
    bankDisplayName: 'Regions Bank',
    accountNumber: accountNumber ?? extractAccountNumber(fullText),
    openingBalance: summary.openingBalance,
    printedDeposits: summary.printedDeposits,
    printedWithdrawals: summary.printedWithdrawals,
    closingBalance: summary.closingBalance,
    printedLines: summary.printedLines,
    reconciliationSpec: summary.reconciliationSpec,
    statementYear: year
  };

  const normalized = mapPlumberRowsToRegionsNormalized(
    plumberTransactions,
    year,
    summary.printedLines
  );
  let transactions = mapToLedgerTransactions(normalized);
  if (!transactions.length) return null;

  // Plumber covers deposits/withdrawals; fold in CHECKS + RETURNED CHECKS + FEES
  // from the text grid (pdfplumber routinely misses these sections).
  transactions = appendSupplementalLedgers(transactions, fullText, year);

  const reconciliation = reconcileStatement(meta, transactions);
  // reconcileStatement.checksumOk is already the universal ledger gate
  // (Tier-A or activity match). printedClosingMatch is identity-only.
  const ledgerOk = Boolean(reconciliation.checksumOk);
  const printedIdentityOk = Boolean(reconciliation.printedClosingMatch);

  // #region agent log
  {
    const topOutflows = [...transactions]
      .filter((t) => Number(t?.amount) < 0)
      .sort((a, b) => Math.abs(Number(b.amount)) - Math.abs(Number(a.amount)))
      .slice(0, 6)
      .map((t) => ({
        amount: Number(t.amount),
        section: t.section || t.sectionLabel || null,
        desc: String(t.description || '').slice(0, 50)
      }));
    fetch('http://127.0.0.1:7779/ingest/14ba3817-11f8-4e9c-85f8-0a9bab98d3ad', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '05b151' },
      body: JSON.stringify({
        sessionId: '05b151',
        runId: 'pre-fix',
        hypothesisId: 'A,C,E',
        location: 'regionsBusinessCheckingProfile.js:tryRecover',
        message: 'regions plumber recovery result',
        data: {
          plumberIn: plumberTransactions.length,
          normalizedOut: normalized.length,
          txnCount: transactions.length,
          checksAppended: true,
          ledgerOk,
          printedIdentityOk,
          depositsMatch: reconciliation.depositsMatch,
          withdrawalsMatch: reconciliation.withdrawalsMatch,
          parsedDeposits: reconciliation.parsedDeposits,
          printedDeposits: reconciliation.printedDeposits,
          parsedWithdrawals: reconciliation.parsedWithdrawals,
          printedWithdrawals: reconciliation.printedWithdrawals,
          returnedChecksRows: transactions.filter(
            (t) => String(t.section || t.sectionLabel || '') === 'returnedChecks'
          ).length,
          checksRows: transactions.filter(
            (t) => String(t.section || t.sectionLabel || '') === 'checks'
          ).length,
          feesRows: transactions.filter(
            (t) => String(t.section || t.sectionLabel || '') === 'fees'
          ).length,
          topOutflows
        },
        timestamp: Date.now()
      })
    }).catch(() => {});
  }
  // #endregion

  return {
    checksumOk: ledgerOk,
    printedIdentityOk,
    reconciliation,
    transactions,
    normalized,
    meta
  };
}

export function extractRaw(ctx) {
  const {
    text,
    defaultYear,
    rtn,
    accountNumber: ctxAccount,
    stitcherPrinted,
    typeAText,
    plumberTransactions
  } = ctx;

  const fullText = String(text || '');
  const summary = buildRegionsSummaryMeta(fullText, { stitcherPrinted, typeAText });
  if (!summary) {
    throw new Error('Regions Business Checking: could not extract activity summary');
  }

  const year = defaultYear ?? inferStatementYear(fullText);
  const accountNumber = ctxAccount ?? extractAccountNumber(fullText);

  // Prefer column-aware pdfplumber rows for deposits/withdrawals; always fold in
  // text CHECKS + RETURNED CHECKS + FEES (pdfplumber routinely misses these).
  const sections = parseRegionsSections(fullText, year);

  let normalized;
  let transactions;
  if (Array.isArray(plumberTransactions) && plumberTransactions.length > 0) {
    normalized = mapPlumberRowsToRegionsNormalized(
      plumberTransactions,
      year,
      summary.printedLines
    );
    transactions = appendSupplementalLedgers(
      mapToLedgerTransactions(normalized),
      fullText,
      year
    );
  } else {
    normalized = sections.transactions;
    transactions = mapToLedgerTransactions(normalized);
  }

  const meta = {
    bankDisplayName: 'Regions Bank',
    accountNumber,
    openingBalance: summary.openingBalance,
    printedDeposits: summary.printedDeposits,
    printedWithdrawals: summary.printedWithdrawals,
    closingBalance: summary.closingBalance,
    printedLines: summary.printedLines,
    reconciliationSpec: summary.reconciliationSpec,
    statementYear: year,
    extractionProfile: PROFILE_ID
  };

  return {
    meta,
    normalizedTransactions: normalized,
    transactions,
    sectionChunks: sections.bySection,
    parsedSectionTotals: sections.sectionTotals,
    stitcherPrinted: {
      opening: summary.openingBalance,
      closing: summary.closingBalance,
      totalDeposits: summary.printedDeposits,
      totalWithdrawals: summary.printedWithdrawals
    }
  };
}

export async function extract(ctx) {
  const {
    text,
    defaultYear,
    plumberTransactions,
    rtn,
    accountNumber,
    stitcherPrinted,
    typeAText,
    parserService,
    resolvedBankType,
    options
  } = ctx;

  const raw = extractRaw({
    text,
    defaultYear,
    rtn,
    accountNumber,
    stitcherPrinted,
    typeAText,
    plumberTransactions
  });
  const { meta } = raw;
  let normalized = raw.normalizedTransactions;
  let ledgerTransactions = raw.transactions;
  const year = meta.statementYear ?? defaultYear ?? inferStatementYear(String(text || ''));
  let regionsPlumberTransactions = null;

  let reconciliation = reconcileStatement(meta, ledgerTransactions);

  if (Array.isArray(plumberTransactions) && plumberTransactions.length > 0) {
    const recovered = tryRecoverRegionsFromPlumber({
      plumberTransactions,
      text,
      defaultYear: year,
      rtn,
      accountNumber,
      stitcherPrinted,
      typeAText
    });
    if (recovered?.transactions?.length) {
      regionsPlumberTransactions = recovered.transactions;
      const tierAOk = Boolean(recovered.reconciliation?.checksumRecon?.ok);
      // recovered.checksumOk is ledger-quality (Tier A or activity match), not printed identity.
      if (recovered.checksumOk || tierAOk) {
        normalized = recovered.normalized;
        ledgerTransactions = recovered.transactions;
        reconciliation = recovered.reconciliation;
        logger.info(
          tierAOk && !recovered.printedIdentityOk
            ? '[REGIONS_BUSINESS] accepted pdfplumber on Tier A (printed section drift)'
            : '[REGIONS_BUSINESS] accepted pdfplumber rows (primary)',
          {
            txnCount: ledgerTransactions.length,
            tierAOk,
            tierBOk: Boolean(recovered.printedIdentityOk),
            ledgerOk: Boolean(recovered.checksumOk),
            parsedDeposits: reconciliation.parsedDeposits,
            printedDeposits: reconciliation.printedDeposits,
            parsedWithdrawals: reconciliation.parsedWithdrawals,
            printedWithdrawals: reconciliation.printedWithdrawals
          }
        );
      } else {
        logger.warn('[REGIONS_BUSINESS] pdfplumber rows rejected by reconciliation (primary)', {
          fileName: options?.fileName ?? null,
          plumberIn: plumberTransactions.length,
          mappedOut: recovered.normalized?.length ?? 0,
          tierAOk,
          printedIdentityOk: Boolean(recovered.printedIdentityOk),
          parsedDeposits: recovered.reconciliation?.parsedDeposits,
          printedDeposits: recovered.reconciliation?.printedDeposits,
          parsedWithdrawals: recovered.reconciliation?.parsedWithdrawals,
          printedWithdrawals: recovered.reconciliation?.printedWithdrawals
        });
      }
    }
  }

  if (!reconciliation.checksumOk && parserService) {
    const fullText = String(text || '');
    const stitcher = stitchStatement(fullText);
    const bodyText =
      stitcher.typeB.combinedText?.trim().length > 0 ? stitcher.typeB.combinedText : fullText;
    const parser =
      parserService.bankParsers.get(resolvedBankType) ||
      parserService.bankParsers.get('DEFAULT');
    const rawTx = await parserService._extractTransactions(bodyText, parser, {
      defaultYear: year,
      stitcher,
      bodyText,
      layoutTemplate: options?.layoutTemplate
    });
    normalized = (Array.isArray(rawTx) ? rawTx : []).filter((t) => !rejectBleedRow(t));
    ledgerTransactions = appendSupplementalLedgers(
      mapToLedgerTransactions(normalized),
      fullText,
      year
    );
    reconciliation = reconcileStatement(meta, ledgerTransactions);
  }

  if (
    !reconciliation.checksumOk &&
    Array.isArray(plumberTransactions) &&
    plumberTransactions.length > 0
  ) {
    const recovered = tryRecoverRegionsFromPlumber({
      plumberTransactions,
      text,
      defaultYear: year,
      rtn,
      accountNumber,
      stitcherPrinted,
      typeAText
    });
    if (recovered?.checksumOk && recovered.transactions?.length) {
      normalized = recovered.normalized;
      ledgerTransactions = recovered.transactions;
      reconciliation = recovered.reconciliation;
      regionsPlumberTransactions = recovered.transactions;
      logger.info('[REGIONS_BUSINESS] accepted pdfplumber rows after text reconcile miss', {
        txnCount: ledgerTransactions.length,
        checksumOk: reconciliation.checksumOk
      });
    }
  }

  if (!reconciliation.checksumOk) {
    logger.warn('[REGIONS_BUSINESS] rejected — reconciliation failed', {
      parsedDeposits: reconciliation.parsedDeposits,
      printedDeposits: reconciliation.printedDeposits,
      parsedWithdrawals: reconciliation.parsedWithdrawals,
      printedWithdrawals: reconciliation.printedWithdrawals,
      computedClosing: reconciliation.computedClosing,
      closing: reconciliation.closing,
      txnCount: ledgerTransactions.length
    });
    // #region agent log
    fetch('http://127.0.0.1:7779/ingest/14ba3817-11f8-4e9c-85f8-0a9bab98d3ad', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '05b151' },
      body: JSON.stringify({
        sessionId: '05b151',
        runId: 'pre-fix',
        hypothesisId: 'C,D',
        location: 'regionsBusinessCheckingProfile.js:extract-reject',
        message: 'regions extract threw reconciliation error',
        data: {
          fileName: options?.fileName ?? null,
          hadPlumber: Array.isArray(plumberTransactions) && plumberTransactions.length > 0,
          plumberAccepted: Boolean(regionsPlumberTransactions),
          txnCount: ledgerTransactions.length,
          checksumOk: reconciliation.checksumOk,
          printedClosingMatch: reconciliation.printedClosingMatch,
          activityOk: reconciliation.activityOk,
          tierAOk: reconciliation.tierAOk,
          parsedDeposits: reconciliation.parsedDeposits,
          printedDeposits: reconciliation.printedDeposits,
          parsedWithdrawals: reconciliation.parsedWithdrawals,
          printedWithdrawals: reconciliation.printedWithdrawals
        },
        timestamp: Date.now()
      })
    }).catch(() => {});
    // #endregion
    const err = new RegionsParseReconciliationError(reconciliation);
    err.regionsPlumberTransactions = regionsPlumberTransactions;
    throw err;
  }

  logger.info('[REGIONS_BUSINESS] extracted', {
    txnCount: ledgerTransactions.length,
    printedDeposits: meta.printedDeposits,
    opening: meta.openingBalance,
    closing: meta.closingBalance,
    checksumOk: true,
    tierAOk: Boolean(reconciliation.tierAOk ?? reconciliation.checksumRecon?.ok),
    activityOk: Boolean(reconciliation.activityOk)
  });

  return {
    meta,
    normalizedTransactions: normalized,
    transactions: ledgerTransactions,
    reconciliation,
    accepted: true,
    regionsPlumberTransactions,
    stitcherPrinted: raw.stitcherPrinted
  };
}

export default {
  PROFILE_ID,
  RegionsParseReconciliationError,
  detect,
  extractRaw,
  extract,
  buildRegionsSummaryMeta,
  tryRecoverRegionsFromPlumber,
  mapToLedgerTransactions
};
