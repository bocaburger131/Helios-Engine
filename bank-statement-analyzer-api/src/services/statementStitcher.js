/**
 * Stitcher: horizontal section slicing (Type A / B / C) before transaction mapping.
 * @license Copyright (c) 2025 Shift 4 Financial INC
 */

import logger from '../utils/logger.js';
import { getReconciliationSpec } from './extraction/reconciliationSpec.js';

const RE_PAGE_MARKER = /page\s+(\d+)\s+of\s+(\d+)/gi;

export const RE_PERIOD_SUMMARY_START =
  /statement\s+period\s+activity\s+summary|period\s+activity\s+summary/i;

export const RE_PERIOD_SUMMARY_END_ANCHOR = /ending\s+balance\s+on/i;

export const RE_SUMMARY_BEGINNING_ON = /beginning\s+balance(?:\s+on)?/i;

/** Compact summary block: a SUMMARY heading followed closely by Beginning Balance. */
export const RE_COMPACT_SUMMARY_BLOCK =
  /\bSUMMARY\b[\s\S]{0,400}?beginning\s+balance/i;

export const RE_SUMMARY_DEPOSITS_CREDITS =
  /deposits?\s*\/\s*credits?|deposits?\s+and\s+(?:other\s+)?credits?/i;

export const RE_SUMMARY_WITHDRAWALS_DEBITS =
  /withdrawals?\s*\/\s*debits?|withdrawals?\s+and\s+(?:other\s+)?debits?/i;

export const RE_TRANSACTION_HISTORY = /transaction\s+history/i;

export const RE_TYPE_C_FOOTER =
  /daily\s+balance\s+summary|daily\s+ledger\s+balances?|interest\s+summary|average\s+daily\s+balance|checks?\s*cleared|bank\s+fees?/i;

/** Rollup lines that must never enter the Type B transaction ledger. */
export const RE_SUMMARY_LEDGER_LINE =
  /\b(deposits?\s*(?:\/|and)\s*credits?|withdrawals?\s*(?:\/|and)\s*debits?|total\s+(?:deposits?|credits?|withdrawals?|debits?)|beginning\s+balance\s+on|ending\s+balance\s+on|statement\s+period\s+activity\s+summary)\b/i;

/**
 * @param {string} raw
 * @returns {number|null}
 */
export function parseMoneyFromLine(raw) {
  const text = String(raw || '');
  const m = text.match(/\$?\s*\(?-?\s*((?:\d{1,3}(?:,\d{3})*|\d+)\.\d{2})\)?/);
  if (!m) return null;
  const cleaned = m[1].replace(/,/g, '');
  const n = Number(cleaned);
  if (!Number.isFinite(n)) return null;
  const neg = /\(-/.test(text) || /-\s*\$/.test(text) || /\)\s*$/.test(text.trim());
  return neg ? -n : n;
}

/**
 * @param {string} line
 * @returns {boolean}
 */
export function isSummaryLedgerLine(line) {
  return RE_SUMMARY_LEDGER_LINE.test(String(line || '').trim());
}

/**
 * @param {string} rawText
 * @returns {Array<{ pageIndex: number, totalPages: number|null, text: string }>}
 */
export function splitPages(rawText) {
  const text = String(rawText || '');
  if (!text) return [{ pageIndex: 1, totalPages: null, text: '' }];

  const markers = [];
  let m;
  RE_PAGE_MARKER.lastIndex = 0;
  while ((m = RE_PAGE_MARKER.exec(text)) !== null) {
    markers.push({
      index: m.index,
      pageIndex: Number(m[1]),
      totalPages: Number(m[2])
    });
  }

  if (markers.length === 0) {
    return [{ pageIndex: 1, totalPages: null, text }];
  }

  const pages = [];
  for (let i = 0; i < markers.length; i += 1) {
    const start = markers[i].index;
    const end = i + 1 < markers.length ? markers[i + 1].index : text.length;
    pages.push({
      pageIndex: markers[i].pageIndex,
      totalPages: markers[i].totalPages,
      text: text.slice(start, end)
    });
  }
  return pages;
}

/** Multi-table activity subsection headers (electronic deposits/withdrawals, checks cleared, fees). */
const RE_MULTI_TABLE_ACTIVITY =
  /electronic\s+deposits?|electronic\s+withdrawals?|checks?\s*cleared|bank\s+fees?|service\s+charges?/i;

/**
 * @param {string} pageText
 * @param {number} pageIndex
 * @returns {'A'|'B'|'C'}
 */
export function classifyPageType(pageText, pageIndex) {
  const t = String(pageText || '');
  const hasCompactSummary = RE_COMPACT_SUMMARY_BLOCK.test(t);
  const hasPeriodSummary =
    RE_PERIOD_SUMMARY_START.test(t) ||
    hasCompactSummary ||
    (RE_SUMMARY_BEGINNING_ON.test(t) && RE_SUMMARY_DEPOSITS_CREDITS.test(t));
  const hasTxnGrid =
    RE_TRANSACTION_HISTORY.test(t) ||
    (RE_MULTI_TABLE_ACTIVITY.test(t) && !hasCompactSummary) ||
    (/\d{1,2}\/\d{1,2}/.test(t) && !hasPeriodSummary && !hasCompactSummary);

  if (hasCompactSummary || (hasPeriodSummary && !hasTxnGrid)) return 'A';
  if (RE_TYPE_C_FOOTER.test(t) && !hasTxnGrid) return 'C';
  if (hasTxnGrid) return 'B';
  if (pageIndex <= 2 && RE_SUMMARY_BEGINNING_ON.test(t)) return 'A';
  if (pageIndex === 1 && !hasTxnGrid) return 'A';
  return 'B';
}

/**
 * Anchor-based slice when PDF text has no Page N of M markers.
 * @param {string} rawText
 */
export function stitchStatementByAnchors(rawText) {
  const text = String(rawText || '');
  const lower = text.toLowerCase();
  const txnIdx = lower.search(/transaction\s+history/);
  const summaryIdx = lower.search(
    /statement\s+period\s+activity\s+summary|period\s+activity\s+summary|\bsummary\b[\s\S]{0,120}?beginning\s+balance/
  );
  const dailyIdx = lower.search(/daily\s+balance\s+summary|daily\s+ledger\s+balances?/);

  let typeAEnd = text.length;
  if (txnIdx >= 0) typeAEnd = txnIdx;
  else if (dailyIdx >= 0) typeAEnd = dailyIdx;

  const typeAStart = summaryIdx >= 0 ? summaryIdx : 0;
  const typeAText = text.slice(typeAStart, typeAEnd);

  let typeBStart = txnIdx >= 0 ? txnIdx : typeAEnd;
  let typeBEnd = dailyIdx >= 0 ? dailyIdx : text.length;
  const hasDatedLedger = /\d{1,2}\/\d{1,2}(?:\/\d{2,4})?/.test(text);
  if (typeBStart >= typeBEnd && RE_MULTI_TABLE_ACTIVITY.test(text)) {
    typeBStart = 0;
    typeBEnd = text.length;
  } else if (typeBStart >= typeBEnd && hasDatedLedger && !RE_PERIOD_SUMMARY_START.test(text)) {
    typeBStart = 0;
    typeBEnd = dailyIdx >= 0 ? dailyIdx : text.length;
  }
  const typeBText = text.slice(typeBStart, typeBEnd);

  const typeCStart = dailyIdx >= 0 ? dailyIdx : text.length;
  const typeCText = typeCStart < text.length ? text.slice(typeCStart) : '';

  const printed = mergePrintedTotals(parseTypeAPrintedTotals(typeAText), text);
  const footer = parseTypeCFooter(typeCText);

  return {
    typeA: { text: typeAText, printed, pages: [] },
    typeB: {
      pages: typeBText ? [{ pageIndex: 1, totalPages: null, text: typeBText }] : [],
      combinedText: typeBText
    },
    typeC: { text: typeCText, footer, pages: [] },
    anchors: {
      summaryEndSeen: RE_PERIOD_SUMMARY_END_ANCHOR.test(typeAText),
      transactionHistoryStart: txnIdx >= 0
    },
    pageCount: 1
  };
}

/**
 * @param {string} typeAText
 * @returns {{ opening: number|null, closing: number|null, totalDeposits: number|null, totalWithdrawals: number|null }}
 */
const RE_SUMMARY_BLOCK =
  /beginning\s+balance(?:\s+on\s+[^\n$]*)?\s*\$?\s*([\d,]+\.\d{2})[\s\S]{0,200}?deposits?\s*(?:&|and)\s*(?:other\s+)?credits?\s*\$?\s*([\d,]+\.\d{2})[\s\S]{0,200}?withdrawals?\s*(?:\/|and)\s*(?:other\s+)?debits?\s*-?\s*\$?\s*([\d,]+\.\d{2})[\s\S]{0,300}?ending\s+balance(?:\s+on\s+[^\n$]*)?\s*\$?\s*([\d,]+\.\d{2})/i;

/**
 * Extra debit summary lines (e.g. Checks / Service fees printed outside the main
 * withdrawals total). Vocabulary comes from the generic reconciliation spec —
 * the single registry of summary-line labels — not a stitcher-local duplicate.
 * Only lines that are exactly a spec label + amount are counted.
 * @param {string} blockText
 * @returns {number}
 */
function sumExtraSummaryDebitLines(blockText) {
  const extraDebitLabels = getReconciliationSpec('generic_digital')
    .summaryLines.filter((l) => l.role === 'debit' && l.key !== 'withdrawals')
    .flatMap((l) => l.labels);
  let extra = 0;
  for (const line of String(blockText || '').split(/\r?\n/)) {
    const m = line.trim().match(/^([a-z][a-z\s]*?)\s*-?\$?\s*([\d,]+\.\d{2})\s*$/i);
    if (!m) continue;
    const label = m[1].trim();
    const isExtraDebit = extraDebitLabels.some((re) => {
      const hit = label.match(re);
      return hit != null && hit.index === 0 && hit[0].length === label.length;
    });
    if (!isExtraDebit) continue;
    const n = Number(m[2].replace(/,/g, ''));
    if (Number.isFinite(n)) extra += Math.abs(n);
  }
  return extra;
}

export function parseTypeAPrintedTotals(typeAText) {
  const block = String(typeAText || '');
  const printed = {
    opening: null,
    closing: null,
    totalDeposits: null,
    totalWithdrawals: null
  };

  const blockMatch = block.match(RE_SUMMARY_BLOCK);
  if (blockMatch) {
    const toNum = (s) => {
      const n = Number(String(s).replace(/[$,]/g, ''));
      return Number.isFinite(n) ? Math.abs(n) : null;
    };
    printed.opening = toNum(blockMatch[1]);
    printed.totalDeposits = toNum(blockMatch[2]);
    printed.totalWithdrawals = toNum(blockMatch[3]);
    printed.closing = toNum(blockMatch[4]);
    // BofA summary boxes split debits across Withdrawals / Checks / Service fees lines.
    const extraDebits = sumExtraSummaryDebitLines(blockMatch[0]);
    if (extraDebits > 0 && printed.totalWithdrawals != null) {
      printed.totalWithdrawals = Math.round((printed.totalWithdrawals + extraDebits) * 100) / 100;
    }
    return printed;
  }

  const lines = block.split(/\r?\n/);

  // First match wins for balances: the period summary precedes daily-balance
  // tables whose "Ending Balance" column rows would otherwise overwrite it.
  // Sign is preserved — overdrawn statements print negative balances and the
  // closing identity (opening + flows = closing) needs the true sign.
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (/beginning\s+balance/i.test(trimmed)) {
      const n = parseMoneyFromLine(trimmed);
      if (n != null && printed.opening == null) printed.opening = n;
    } else if (RE_PERIOD_SUMMARY_END_ANCHOR.test(trimmed) || /ending\s+balance/i.test(trimmed)) {
      const n = parseMoneyFromLine(trimmed);
      if (n != null && printed.closing == null) printed.closing = n;
    } else if (RE_SUMMARY_DEPOSITS_CREDITS.test(trimmed)) {
      const n = parseMoneyFromLine(trimmed);
      if (n != null && printed.totalDeposits == null) printed.totalDeposits = Math.abs(n);
    }
    if (RE_SUMMARY_WITHDRAWALS_DEBITS.test(trimmed)) {
      const n = parseMoneyFromLine(trimmed);
      if (n != null && printed.totalWithdrawals == null) printed.totalWithdrawals = Math.abs(n);
    }
  }

  return printed;
}

/**
 * Fill null printed vitals from a fallback text slice (e.g. full pdf-parse body).
 * @param {object} printed
 * @param {string} fallbackText
 */
export function mergePrintedTotals(printed, fallbackText) {
  const base = printed || {
    opening: null,
    closing: null,
    totalDeposits: null,
    totalWithdrawals: null
  };
  const extra = parseTypeAPrintedTotals(fallbackText);
  return {
    opening: base.opening ?? extra.opening,
    closing: base.closing ?? extra.closing,
    totalDeposits: base.totalDeposits ?? extra.totalDeposits,
    totalWithdrawals: base.totalWithdrawals ?? extra.totalWithdrawals
  };
}

/**
 * @param {string} typeCText
 * @returns {{ avgDailyBalance: number|null, bankFees: number|null, checksCleared: number|null }}
 */
export function parseTypeCFooter(typeCText) {
  const lines = String(typeCText || '').split(/\r?\n/);
  const footer = { avgDailyBalance: null, bankFees: null, checksCleared: null };

  for (const line of lines) {
    const trimmed = line.trim();
    if (/average\s+daily\s+balance/i.test(trimmed)) {
      footer.avgDailyBalance = parseMoneyFromLine(trimmed);
    }
    if (/bank\s+fees?/i.test(trimmed) && /total/i.test(trimmed)) {
      footer.bankFees = parseMoneyFromLine(trimmed);
    }
    if (/checks?\s*cleared/i.test(trimmed) && /total/i.test(trimmed)) {
      footer.checksCleared = parseMoneyFromLine(trimmed);
    }
  }

  return footer;
}

/**
 * @param {string} rawText
 * @returns {object}
 */
export function stitchStatement(rawText) {
  const pages = splitPages(rawText);
  if (pages.length === 1 && pages[0].totalPages == null && pages[0].text.length > 0) {
    const byAnchor = stitchStatementByAnchors(rawText);
    logger.info('[STITCHER] Statement sliced (anchor mode)', {
      pages: 1,
      typeA: byAnchor.typeA.text.length > 0 ? 1 : 0,
      typeB: byAnchor.typeB.pages.length,
      typeC: byAnchor.typeC.text.length > 0 ? 1 : 0
    });
    return byAnchor;
  }

  const typeAPages = [];
  const typeBPages = [];
  const typeCPages = [];

  for (const page of pages) {
    const kind = classifyPageType(page.text, page.pageIndex);
    if (kind === 'A') typeAPages.push(page);
    else if (kind === 'C') typeCPages.push(page);
    else typeBPages.push(page);
  }

  const typeAText = typeAPages.map((p) => p.text).join('\n');
  const typeBText = typeBPages.map((p) => p.text).join('\n');
  const typeCText = typeCPages.map((p) => p.text).join('\n');

  const printed = mergePrintedTotals(parseTypeAPrintedTotals(typeAText), rawText);
  const footer = parseTypeCFooter(typeCText);

  let summaryEndSeen = false;
  let transactionHistoryStart = false;
  for (const line of String(rawText || '').split(/\r?\n/)) {
    if (RE_PERIOD_SUMMARY_END_ANCHOR.test(line)) summaryEndSeen = true;
    if (RE_TRANSACTION_HISTORY.test(line)) transactionHistoryStart = true;
  }

  const stitcher = {
    typeA: { text: typeAText, printed, pages: typeAPages },
    typeB: { pages: typeBPages, combinedText: typeBText },
    typeC: { text: typeCText, footer, pages: typeCPages },
    anchors: { summaryEndSeen, transactionHistoryStart },
    pageCount: pages.length
  };

  logger.info('[STITCHER] Statement sliced', {
    pages: stitcher.pageCount,
    typeA: typeAPages.length,
    typeB: typeBPages.length,
    typeC: typeCPages.length,
    printedOpening: printed.opening,
    printedClosing: printed.closing
  });

  return stitcher;
}

export default {
  stitchStatement,
  splitPages,
  classifyPageType,
  parseTypeAPrintedTotals,
  parseTypeCFooter,
  isSummaryLedgerLine,
  parseMoneyFromLine
};
