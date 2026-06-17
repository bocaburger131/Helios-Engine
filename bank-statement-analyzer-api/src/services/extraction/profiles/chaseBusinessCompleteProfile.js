/**

 * Chase Business Complete Checking — section-scoped extraction with printed summary reconciliation.

 */

import { normalizeTransactionForLedger } from '../../../utils/transactionNormalization.js';

import { reconcileStatement } from '../statementReconciliation.js';

import { buildDealIdentity } from '../../../utils/amountSanityGuardrails.js';

import { mergePrintedTotals } from '../../statementStitcher.js';

import logger from '../../../utils/logger.js';

import { parsePlumberRowDate } from '../plumberRowNormalizer.js';
import {
  parseGluedInstanceAmount,
  extractDocumentPrintedTotals,
  mergePrintedWithStitcher as mergePrintedWithStitcherShared
} from '../printedVitalsService.js';

export { parseGluedInstanceAmount };



export const PROFILE_ID = 'chase_business_complete';



const MONEY_TOKEN_RE = /-?\$?\s*\(?-?\s*((?:\d{1,3}(?:,\d{3})*|\d+)\.\d{2})\)?/g;

const DATE_ROW_RE = /^(\d{1,2}\/\d{1,2})\s+([\s\S]+)$/i;

const DATE_INLINE_RE = /(?<!\d)(?<!\d\/)(\d{1,2}\/\d{1,2})\s+(?=[A-Za-z*])/g;

const SKIP_LINE_RE =

  /^(?:date\s+description|instances?\s+amount|total\s+deposits?|total\s+checks?|total\s+electronic|total\s+fees?|page\s+\d+\s+of|^\*start\*|^\*end\*)/i;

const SECTION_HEADERS = [

  { id: 'deposits', re: /deposits?\s+and\s+additions?/i, direction: 'credit' },

  { id: 'checks', re: /checks?\s*paid/i, direction: 'debit' },

  { id: 'electronic_withdrawals', re: /electronic\s+withdrawals?/i, direction: 'debit' },

  { id: 'atm_debit', re: /atm\s+(?:&|and)\s+debit/i, direction: 'debit' },

  { id: 'fees', re: /^(?:fees?|service\s+fees?)\b/i, direction: 'debit' },

  { id: 'other_withdrawals', re: /other\s+withdrawals?/i, direction: 'debit' }

];

const DETAIL_HEADER_RE =
  /(?:deposits?\s+and\s+additions?\s+date\s+(?:description|check)|\*start\*deposits)/i;

const DETAIL_SECTION_END_RE =
  /(?:the\s+monthly\s+service\s+fee|important\s+information|\*end\*statement|\*end\*detail)/i;

const CHASE_ROW_AMOUNT_CAP = 250_000;

const ROUTING_TRACE_BLEED_RE = /\b\d{8,}\b/;



export class ChaseParseReconciliationError extends Error {

  constructor(reconciliation) {

    super('Chase Business Complete: reconciliation failed against printed monthly totals');

    this.name = 'ChaseParseReconciliationError';

    this.reconciliation = reconciliation;

  }

}



export function detect(text) {

  const t = String(text || '');

  if (!/business\s+complete\s+checking/i.test(t) && !/chase\s+business/i.test(t)) {

    if (/jpmorgan\s+chase/i.test(t) && /deposits?\s+and\s+additions?/i.test(t)) {

      return 0.86;

    }

    return 0;

  }

  let score = 0.88;

  if (/deposits?\s+and\s+additions?/i.test(t)) score += 0.04;

  if (/checks?\s*paid/i.test(t)) score += 0.03;

  if (/beginning\s+balance/i.test(t)) score += 0.03;

  return Math.min(score, 1);

}



export function normalizeSpaces(text) {

  return String(text || '')

    .replace(/\r/g, '\n')

    .replace(/[ \t]+/g, ' ')

    .replace(/\u00a0/g, ' ')

    .replace(/ +\n/g, '\n');

}



export function moneyToNumber(s) {

  if (s == null || s === '') return null;

  const raw = String(s).trim();

  const cleaned = raw.replace(/[$,()]/g, '').trim();

  const neg =

    /^\(/.test(raw) ||

    /-\s*\$/.test(raw) ||

    /-\$/.test(raw) ||

    (/-/.test(raw) && !/^\d/.test(cleaned));

  const n = Number(cleaned.replace(/^-/, ''));

  if (!Number.isFinite(n)) return null;

  return neg ? -Math.abs(n) : n;

}



/**

 * Parse balance after Chase summary labels (handles glued instance counts and negatives).

 * @param {string} label e.g. "Beginning Balance" | "Ending Balance"

 * @param {string} text

 */

export function parseLabeledBalance(label, text) {

  const re = new RegExp(

    `${label}(?:\\s*\\d+)?\\s*(?:-\\s*)?\\$?\\s*(-)?\\s*\\$?\\s*([\\d,]+\\.\\d{2})`,

    'i'

  );

  const m = String(text || '').match(re);

  if (!m) return null;

  const n = moneyToNumber(m[2]);

  if (n == null) return null;

  const snippet = m[0] || '';

  const neg = m[1] === '-' || /-\$/.test(snippet) || /-\s*\d/.test(snippet.replace(label, ''));

  return neg ? -Math.abs(n) : n;

}



export function pickLastReasonableAmount(
  line,
  maxAmount = CHASE_ROW_AMOUNT_CAP,
  identity = null
) {
  const lineStr = String(line || '');
  const matches = [...lineStr.matchAll(MONEY_TOKEN_RE)];
  if (!matches.length) return null;

  const prefixBeforeLast = lineStr.slice(0, matches[matches.length - 1].index ?? 0);
  const hasLongDigitRun =
    ROUTING_TRACE_BLEED_RE.test(prefixBeforeLast) &&
    /\b(?:trn|trace|orig\s+co|ind\s+name|routing)\b/i.test(lineStr);

  for (let i = matches.length - 1; i >= 0; i -= 1) {
    const token = matches[i][0];
    const n = moneyToNumber(token);
    if (n == null || !Number.isFinite(n)) continue;
    if (Math.abs(n) > maxAmount) continue;
    if (Math.abs(n) < 0.01) continue;

    const tokenDigits = token.replace(/\D/g, '');
    if (identity?.forbiddenDigitStrings?.length) {
      const forbidden = identity.forbiddenDigitStrings;
      if (forbidden.some((f) => f && (tokenDigits === f || tokenDigits.endsWith(f)))) {
        continue;
      }
    }
    if (hasLongDigitRun && i < matches.length - 1) continue;
    if (hasLongDigitRun && tokenDigits.length >= 8 && !/\.\d{2}\)?$/.test(token.trim())) {
      continue;
    }

    return n;
  }

  return null;
}



/**

 * Slice detail activity (skip INSTANCES summary block when possible).

 * @param {string} text

 */

export function findChaseDetailStartIndex(text) {
  const t = normalizeSpaces(text);
  const candidates = [
    t.search(/\*start\*deposits/i),
    t.search(/deposits?\s+and\s+additions?\s+date\s+(?:description|check)/i),
    t.search(/\*start\*checks/i),
    t.search(/\*start\*electronic/i),
    t.search(/checks?\s*paid\s+date/i),
    t.search(/electronic\s+withdrawals?\s+date/i)
  ].filter((i) => i >= 0);
  if (candidates.length) return Math.min(...candidates);

  const header = t.match(DETAIL_HEADER_RE);
  if (header?.index != null) return header.index;

  let lastDep = -1;
  const depRe = /deposits?\s+and\s+additions?/gi;
  let m;
  while ((m = depRe.exec(t)) !== null) {
    const tail = t.slice(m.index, m.index + 120);
    if (/date\s+(?:description|check)/i.test(tail)) lastDep = m.index;
  }
  return lastDep >= 0 ? lastDep : -1;
}

export function extractChaseDetailSection(text) {
  const t = normalizeSpaces(text);
  const start = findChaseDetailStartIndex(t);
  if (start >= 0) {
    let slice = t.slice(start);
    const endMatch = slice.search(DETAIL_SECTION_END_RE);
    if (endMatch > 0) slice = slice.slice(0, endMatch);
    return slice;
  }

  const inst = t.search(/instances?\s+amount/i);
  if (inst >= 0) {
    const after = t.slice(inst);
    const dep = after.search(/deposits?\s+and\s+additions?/i);
    if (dep >= 0) {
      let slice = after.slice(dep);
      const endMatch = slice.search(DETAIL_SECTION_END_RE);
      if (endMatch > 0) slice = slice.slice(0, endMatch);
      return slice;
    }
  }

  return t;
}



/**

 * Insert row breaks before MM/DD tokens that begin transaction lines in glued pdf-parse text.

 * @param {string} text

 */

export function injectChaseRowBreaks(text) {

  let s = String(text || '');

  s = s.replace(/\*start\*(\w+)/gi, '\n*start*$1\n');

  s = s.replace(/\*end\*(\w+)/gi, '\n*end*$1\n');

  s = s.replace(
    /(deposits?\s+and\s+additions?\s+date\s+(?:description|check))/gi,
    '\n$1\n'
  );

  s = s.replace(/(checks?\s*paid\s+date\s+check)/gi, '\n$1\n');

  s = s.replace(
    /(electronic\s+withdrawals?\s+date\s+description)/gi,
    '\n$1\n'
  );

  for (const sec of SECTION_HEADERS) {

    s = s.replace(sec.re, (match) => `\n${match}\n`);

  }

  return s.replace(DATE_INLINE_RE, '\n$1 ');

}



/**

 * @param {string} fullText

 * @param {string} [typeBText]

 */

export function pickChaseExtractionText(fullText, typeBText) {

  const candidates = [typeBText, fullText].filter((t) => String(t || '').trim().length > 0);

  for (const raw of candidates) {

    const section = extractChaseDetailSection(normalizeSpaces(raw));

    if (injectChaseRowBreaks(section).split('\n').some((l) => DATE_ROW_RE.test(l.trim()))) {

      return section;

    }

  }

  return extractChaseDetailSection(normalizeSpaces(fullText || typeBText || ''));

}



/**

 * Parse Chase INSTANCES / summary block (handles glued instance counts).

 * @param {string} text

 */

/**
 * Slice Type A INSTANCES / summary block only (avoids trace lines in detail).
 * @param {string} text
 */
export function extractChaseSummarySlice(text) {
  const t = normalizeSpaces(text);
  const inst = t.search(/instances?\s+amount/i);
  if (inst >= 0) {
    const end = t.search(
      /\*start\*deposits|deposits?\s+and\s+additions?\s+date\s+(?:description|check)/i
    );
    if (end > inst) return t.slice(inst, end);
    return t.slice(inst, Math.min(inst + 3500, t.length));
  }
  const sum = t.search(/\*start\*summary/i);
  if (sum >= 0) return t.slice(sum, Math.min(sum + 3500, t.length));
  return t.slice(0, 4500);
}

function amountAfterSectionLabel(text, labelRe) {
  const t = String(text || '');
  const m = t.match(labelRe);
  if (!m || m.index == null) return null;
  const tailLine = t
    .slice(m.index + m[0].length, m.index + m[0].length + 32)
    .split('\n')[0];
  const glued = parseGluedInstanceAmount(tailLine);
  if (glued != null) return glued;
  const amounts = [];
  for (const hit of tailLine.matchAll(MONEY_TOKEN_RE)) {
    const n = moneyToNumber(hit[0]);
    if (n == null) continue;
    const abs = Math.abs(n);
    if (abs >= 1 && abs <= 500_000) amounts.push(abs);
  }
  return amounts.length ? Math.max(...amounts) : null;
}

/**
 * Amount after a summary label using glued parser first, then largest token fallback.
 */
export function pickLargestAmountAfterLabel(text, labelRe, opts = {}) {
  const min = opts.min ?? 50;
  const max = opts.max ?? 500_000;
  const v = amountAfterSectionLabel(text, labelRe);
  if (v != null && v >= min && v <= max) return v;
  return null;
}

/**
 * Authoritative printed totals from full pdf-parse text (Total … lines).
 * @param {string} text
 */
export function extractChasePrintedFromDocument(text) {
  return extractDocumentPrintedTotals(text, { summarySlice: extractChaseSummarySlice });
}

function sumChaseWithdrawalSections(t) {
  const labels = [
    /checks?\s*paid/i,
    /electronic\s+withdrawals?/i,
    /atm\s+(?:&|and)\s+debit/i,
    /other\s+withdrawals?/i,
    /\bfee?s?\b/i
  ];
  let sum = 0;
  let any = false;
  for (const re of labels) {
    const v = amountAfterSectionLabel(t, re);
    if (v != null) {
      sum += v;
      any = true;
    }
  }
  return any ? sum : null;
}

/** Sum printed "Total …" withdrawal lines (checks, electronic, fees, etc.). */
function sumChasePrintedWithdrawalTotals(t) {
  const labels = [
    /total\s+checks?\s*paid\s+\$?\s*([\d,]+\.\d{2})/gi,
    /total\s+electronic\s+withdrawals?\s+\$?\s*([\d,]+\.\d{2})/gi,
    /total\s+atm\s+(?:&|and)\s+debit\s+\$?\s*([\d,]+\.\d{2})/gi,
    /total\s+other\s+withdrawals?\s+\$?\s*([\d,]+\.\d{2})/gi,
    /total\s+fees?\s+\$?\s*([\d,]+\.\d{2})/gi
  ];
  let sum = 0;
  let any = false;
  for (const re of labels) {
    for (const m of t.matchAll(re)) {
      const n = moneyToNumber(m[1]);
      if (n != null) {
        sum += Math.abs(n);
        any = true;
      }
    }
  }
  return any ? sum : null;
}

/** Fill only null vitals from stitcher — never override document totals. */
export function mergeChaseSummaryWithStitcher(summary, stitcherPrinted) {
  return mergePrintedWithStitcherShared(summary, stitcherPrinted);
}

function extractSummaryFromSlice(text) {
  const t = extractChaseSummarySlice(text);

  const totalDepMatch = t.match(
    /Total\s+Deposits?\s+and\s+Additions?\s+\$?\s*([\d,]+\.\d{2})/i
  );

  let printedDeposits = totalDepMatch ? moneyToNumber(totalDepMatch[1]) : null;
  if (printedDeposits == null) {
    printedDeposits = amountAfterSectionLabel(t, /deposits?\s+and\s+additions?/i);
  }

  let printedWithdrawals = sumChasePrintedWithdrawalTotals(t);
  if (printedWithdrawals == null) {
    const totalWdMatch = t.match(
      /Total\s+Withdrawals?\s+\$?\s*-?\s*\$?\s*([\d,]+\.\d{2})/i
    );
    if (totalWdMatch && !/electronic|checks/i.test(totalWdMatch[0])) {
      printedWithdrawals = moneyToNumber(totalWdMatch[1]);
    }
  }
  if (printedWithdrawals == null) {
    printedWithdrawals = sumChaseWithdrawalSections(t);
  }

  const openingBalance = parseLabeledBalance('Beginning\\s+Balance', t);
  const closingBalance = parseLabeledBalance('Ending\\s+Balance', t);

  if (openingBalance == null && closingBalance == null && printedDeposits == null) {
    return null;
  }

  return {
    openingBalance,
    closingBalance,
    printedDeposits,
    printedWithdrawals: printedWithdrawals != null ? Math.abs(printedWithdrawals) : null
  };
}

/**
 * @param {string} text
 * @param {{ stitcherPrinted?: object, typeAText?: string }} [opts]
 */
export function buildChaseSummaryMeta(text, opts = {}) {
  const full = normalizeSpaces(text);
  const docTotals = extractChasePrintedFromDocument(full);
  const fromSlice = extractSummaryFromSlice(full);
  let summary = {
    openingBalance: fromSlice?.openingBalance ?? docTotals?.openingBalance ?? null,
    closingBalance: fromSlice?.closingBalance ?? docTotals?.closingBalance ?? null,
    printedDeposits: docTotals?.printedDeposits ?? fromSlice?.printedDeposits ?? null,
    printedWithdrawals: fromSlice?.printedWithdrawals ?? docTotals?.printedWithdrawals ?? null
  };
  if (
    summary.openingBalance == null &&
    summary.closingBalance == null &&
    summary.printedDeposits == null
  ) {
    summary = fromSlice ?? docTotals;
  }
  if (!opts.stitcherPrinted && !opts.typeAText) return summary;

  const merged = mergePrintedTotals(opts.stitcherPrinted || {}, opts.typeAText || full);
  return mergeChaseSummaryWithStitcher(summary, {
    opening: merged.opening,
    closing: merged.closing,
    totalDeposits: merged.totalDeposits,
    totalWithdrawals: merged.totalWithdrawals
  });
}

export function extractSummary(text, opts = {}) {
  return buildChaseSummaryMeta(text, opts);
}



export function extractAccountNumber(text) {

  const m = String(text || '').match(/Account\s+Number:?\s*([*\d]{4,})/i);

  return m ? m[1].replace(/\D/g, '') || m[1] : null;

}



export function inferStatementYear(text) {

  const years = [...String(text || '').matchAll(/\b(20\d{2})\b/g)].map((m) => Number(m[1]));

  if (years.length) return years[years.length - 1];

  return new Date().getFullYear();

}



function isSectionHeader(line) {

  const trimmed = String(line || '').trim();

  if (!trimmed || trimmed.length > 120) return null;

  if (/^\d{1,2}\/\d{1,2}/.test(trimmed)) return null;

  const startMarker = trimmed.match(/^\*start\*(\w+)/i);
  if (startMarker) {
    const marker = startMarker[1].toLowerCase();
    if (marker.includes('deposit')) {
      return SECTION_HEADERS.find((s) => s.id === 'deposits') ?? null;
    }
    if (marker.includes('check')) {
      return SECTION_HEADERS.find((s) => s.id === 'checks') ?? null;
    }
    if (marker.includes('electronic')) {
      return SECTION_HEADERS.find((s) => s.id === 'electronic_withdrawals') ?? null;
    }
    if (marker.includes('atm')) {
      return SECTION_HEADERS.find((s) => s.id === 'atm_debit') ?? null;
    }
    if (marker.includes('fee')) {
      return SECTION_HEADERS.find((s) => s.id === 'fees') ?? null;
    }
    if (marker.includes('withdraw')) {
      return SECTION_HEADERS.find((s) => s.id === 'other_withdrawals') ?? null;
    }
  }

  for (const sec of SECTION_HEADERS) {

    if (sec.re.test(trimmed)) return sec;

  }

  return null;

}



function shouldSkipLine(line) {

  const trimmed = String(line || '').trim();

  if (!trimmed) return true;

  if (SKIP_LINE_RE.test(trimmed)) return true;

  if (/^total\b/i.test(trimmed) && MONEY_TOKEN_RE.test(trimmed)) return true;

  if (/instances?\s+amount/i.test(trimmed)) return true;

  if (/statement\s+period/i.test(trimmed)) return true;

  if (/check\s+no\.?\s*description/i.test(trimmed)) return true;

  return false;

}



export function parseChaseRow(line, year, sectionDirection, identity = null) {

  const trimmed = String(line || '').trim();

  const dm = trimmed.match(DATE_ROW_RE);

  if (!dm) return null;



  const amount = pickLastReasonableAmount(trimmed, CHASE_ROW_AMOUNT_CAP, identity);

  if (amount == null) return null;



  const description = dm[2]

    .replace(MONEY_TOKEN_RE, ' ')

    .replace(/\s+/g, ' ')

    .trim();

  if (!description || description.length < 2) return null;
  if (/^total\b/i.test(description)) return null;



  const signed =

    sectionDirection === 'credit' ? Math.abs(amount) : -Math.abs(amount);



  return {

    postedDate: normalizeDate(dm[1], year),

    description,

    amount: signed,

    rawLine: trimmed

  };

}



export function normalizeDate(mmdd, year) {

  const [m, d] = String(mmdd).split('/').map(Number);

  return `${year}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

}



/**

 * Merge continuation lines into logical transaction rows (pdf-parse often omits newlines).

 * @param {string} section

 */

export function splitChaseRows(section) {

  const broken = injectChaseRowBreaks(section);

  const lines = broken

    .split('\n')

    .map((x) => x.trim())

    .filter(Boolean);



  const rows = [];

  let current = null;

  let activeSection = SECTION_HEADERS[0];



  for (const line of lines) {

    const hdr = isSectionHeader(line);

    if (hdr) {

      if (current) rows.push({ text: current.trim(), section: activeSection });

      current = null;

      activeSection = hdr;

      continue;

    }

    if (shouldSkipLine(line)) {

      if (current) rows.push({ text: current.trim(), section: activeSection });

      current = null;

      continue;

    }

    if (DATE_ROW_RE.test(line)) {

      if (current) rows.push({ text: current.trim(), section: activeSection });

      current = line;

    } else if (current) {

      current += ` ${line}`;

    }

  }

  if (current) rows.push({ text: current.trim(), section: activeSection });

  return rows;

}



/**

 * Walk detail sections and collect dated rows.

 * @param {string} text

 * @param {number} year

 */

export function extractDetailTransactions(text, year, identity = null) {

  const section = extractChaseDetailSection(text);

  const logicalRows = splitChaseRows(section);

  const rows = [];



  for (const entry of logicalRows) {

    const line = typeof entry === 'string' ? entry : entry.text;

    const activeSection = typeof entry === 'string' ? SECTION_HEADERS[0] : entry.section;

    const parsed = parseChaseRow(line, year, activeSection?.direction || 'debit', identity);

    if (parsed) rows.push({ ...parsed, sectionId: activeSection?.id || null });

  }



  return rows;

}



/**

 * Map pdfplumber / vision-shaped rows into Chase normalized rows.

 * @param {Array<object>} plumberRows

 * @param {number} year

 */

/**
 * Map pdfplumber section string to Chase section id (exact ids only — no substring "deposit" bleed).
 */
export function mapChasePlumberSection(sectionRaw, type = '') {
  const s = String(sectionRaw || '').toLowerCase().trim();
  if (!s) {
    return type === 'CREDIT' ? 'deposits' : 'checks';
  }
  if (s === 'deposits' || s === 'deposits_and_additions') return 'deposits';
  if (s.includes('electronic')) return 'electronic_withdrawals';
  if (s.includes('atm') || s.includes('debit_card')) return 'atm_debit';
  if (s.includes('check')) return 'checks';
  if (s.includes('fee')) return 'fees';
  if (s.includes('other') && s.includes('withdraw')) return 'other_withdrawals';
  if (s.includes('withdraw')) return 'electronic_withdrawals';
  return s;
}

export function mapPlumberRowsToChaseNormalized(plumberRows, year, logContext = {}) {

  const out = [];
  const inCount = Array.isArray(plumberRows) ? plumberRows.length : 0;

  for (const row of plumberRows || []) {

    const type = String(row.type || '').toUpperCase();

    const sectionRaw = String(row.section || '').toLowerCase();

    const absAmt = Math.abs(Number(row.amount));

    if (!Number.isFinite(absAmt) || absAmt < 0.01 || absAmt > CHASE_ROW_AMOUNT_CAP) continue;

    const description = String(row.description || '').trim();

    if (!description || description.length < 2) continue;

    if (/^total\b/i.test(description)) continue;

    if (absAmt > 1_000_000) continue;

    if (
      ROUTING_TRACE_BLEED_RE.test(description) &&
      (absAmt > 25_000 || /\b(?:trn|trace|orig\s+co|ind\s+name)\b/i.test(description))
    ) {
      continue;
    }

    const isoDate = parsePlumberRowDate(row.dateRaw ?? row.date, year);

    if (!isoDate) continue;



    let sectionId = mapChasePlumberSection(sectionRaw, type);

    if (/deposits?\s+and\s+additions?/i.test(description)) sectionId = 'deposits';

    const isCredit =
      type === 'DEBIT' ? false : type === 'CREDIT' ? true : sectionId === 'deposits';

    const signed = isCredit ? absAmt : -absAmt;

    out.push({

      postedDate: isoDate,

      description,

      amount: signed,

      sectionId,

      rawLine: `[PDF_PLUMBER] ${description}`

    });

  }

  if (logContext.log !== false && inCount > 0) {
    const credits = out.filter((r) => r.amount > 0).length;
    logger.info('[CHASE_BUSINESS] mapPlumberRows', {
      fileName: logContext.fileName ?? null,
      inCount,
      outCount: out.length,
      creditRows: credits,
      debitRows: out.length - credits,
      filtered: inCount - out.length
    });
  }

  return out;

}



export function mapToLedgerTransactions(normalized) {

  return (normalized || [])

    .filter((t) => t.amount != null && Number.isFinite(t.amount) && t.amount !== 0)

    .map((t) =>

      normalizeTransactionForLedger({

        date: t.postedDate,

        description: t.description,

        amount: t.amount,

        type: t.amount >= 0 ? 'CREDIT' : 'DEBIT',

        rawLine: t.rawLine,

        extractionSource: PROFILE_ID,

        sectionLabel: t.sectionId

      })

    );

}



/**

 * Raw extraction — no checksum gate (layout-first Agent 1).

 * @param {object} ctx

 */

export function extractRaw(ctx) {

  const {
    text,
    defaultYear,
    altText,
    rtn,
    accountNumber: ctxAccount,
    stitcherPrinted,
    typeAText,
    sectionChunks
  } = ctx;

  const fullText = normalizeSpaces(text);

  const bodyText =
    sectionChunks?.transactionHistory?.trim().length > 0
      ? sectionChunks.transactionHistory
      : pickChaseExtractionText(fullText, altText);

  const summaryOpts = { stitcherPrinted, typeAText };

  const summary =
    buildChaseSummaryMeta(fullText, summaryOpts) ??
    buildChaseSummaryMeta(bodyText, summaryOpts);

  if (!summary) {
    throw new Error('Chase Business Complete: could not extract activity summary');
  }

  const year = defaultYear ?? inferStatementYear(fullText);

  const accountNumber = ctxAccount ?? extractAccountNumber(fullText);

  const dealIdentity = buildDealIdentity({ rtn, accountNumber });

  const meta = {
    bankDisplayName: 'Chase',
    accountNumber,
    accountNumberLast4: accountNumber ? String(accountNumber).slice(-4) : null,
    openingBalance: summary.openingBalance,
    printedDeposits: summary.printedDeposits,
    printedWithdrawals: summary.printedWithdrawals,
    closingBalance: summary.closingBalance,
    statementYear: year,
    extractionProfile: PROFILE_ID
  };

  const normalized = extractDetailTransactions(bodyText, year, dealIdentity);

  const ledgerTransactions = mapToLedgerTransactions(normalized);

  return {
    meta,
    normalizedTransactions: normalized,
    transactions: ledgerTransactions,
    sectionChunks: {
      summary: sectionChunks?.summary ?? extractChaseSummarySlice(fullText),
      transactionHistory: bodyText
    },
    stitcherPrinted: {
      opening: summary.openingBalance,
      closing: summary.closingBalance,
      totalDeposits: summary.printedDeposits,
      totalWithdrawals: summary.printedWithdrawals
    }
  };

}



/**

 * @param {{ text: string, defaultYear?: number, altText?: string, plumberTransactions?: object[] }} ctx

 */

export function extract(ctx) {

  const {
    text,
    defaultYear,
    altText,
    plumberTransactions,
    rtn,
    accountNumber: ctxAccount,
    stitcherPrinted,
    typeAText,
    sectionChunks
  } = ctx;

  const raw = extractRaw({
    text,
    defaultYear,
    altText,
    rtn,
    accountNumber: ctxAccount,
    stitcherPrinted,
    typeAText,
    sectionChunks
  });

  const { meta, normalizedTransactions, transactions: ledgerFromRaw } = raw;

  let normalized = normalizedTransactions;
  let ledgerTransactions = ledgerFromRaw;
  const year = meta.statementYear ?? defaultYear ?? inferStatementYear(normalizeSpaces(text));

  let reconciliation = reconcileStatement(meta, ledgerTransactions);

  let chasePlumberTransactions = null;

  if (

    !reconciliation.checksumOk &&

    Array.isArray(plumberTransactions) &&

    plumberTransactions.length > 0

  ) {

    const plumberNorm = mapPlumberRowsToChaseNormalized(plumberTransactions, year, {
      fileName: ctx?.options?.fileName,
      log: true
    });

    const plumberLedger = mapToLedgerTransactions(plumberNorm);

    const plumberRecon = reconcileStatement(meta, plumberLedger);

    chasePlumberTransactions = plumberLedger;

    const tierAOk = Boolean(plumberRecon.checksumRecon?.ok);

    if (plumberRecon.checksumOk || tierAOk) {

      normalized = plumberNorm;

      ledgerTransactions = plumberLedger;

      reconciliation = plumberRecon;

      logger.info(
        tierAOk && !plumberRecon.checksumOk
          ? '[CHASE_BUSINESS] accepted pdfplumber on Tier A (printed section drift)'
          : '[CHASE_BUSINESS] accepted pdfplumber rows after text reconcile miss',
        {
          txnCount: ledgerTransactions.length,
          tierAOk,
          tierBOk: plumberRecon.checksumOk,
          parsedDeposits: plumberRecon.parsedDeposits,
          printedDeposits: plumberRecon.printedDeposits
        }
      );

    } else if (plumberLedger.length > 0) {

      logger.warn('[CHASE_BUSINESS] pdfplumber rows rejected by reconciliation', {

        fileName: ctx?.options?.fileName ?? null,

        plumberIn: plumberTransactions.length,

        mappedOut: plumberNorm.length,

        parsedDeposits: plumberRecon.parsedDeposits,

        printedDeposits: plumberRecon.printedDeposits,

        parsedWithdrawals: plumberRecon.parsedWithdrawals,

        printedWithdrawals: plumberRecon.printedWithdrawals

      });

    }

  }



  if (!reconciliation.checksumOk) {

    logger.warn('[CHASE_BUSINESS] rejected — reconciliation failed', {

      parsedDeposits: reconciliation.parsedDeposits,

      printedDeposits: reconciliation.printedDeposits,

      parsedWithdrawals: reconciliation.parsedWithdrawals,

      printedWithdrawals: reconciliation.printedWithdrawals,

      computedClosing: reconciliation.computedClosing,

      closing: reconciliation.closing,

      txnCount: ledgerTransactions.length

    });

    const err = new ChaseParseReconciliationError(reconciliation);
  err.chasePlumberTransactions = chasePlumberTransactions;
  throw err;

  }



  logger.info('[CHASE_BUSINESS] extracted', {

    txnCount: ledgerTransactions.length,

    printedDeposits: meta.printedDeposits,

    opening: meta.openingBalance,

    closing: meta.closingBalance,

    checksumOk: true

  });



  return {

    meta,

    normalizedTransactions: normalized,

    transactions: ledgerTransactions,

    reconciliation,

    accepted: true,

    chasePlumberTransactions,

    stitcherPrinted: raw.stitcherPrinted

  };

}



/**
 * Tier B recovery: map pdfplumber rows and accept only when reconcileStatement passes.
 * @param {object} params
 */
export function tryRecoverChaseFromPlumber(params = {}) {
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

  const fullText = normalizeSpaces(text || '');
  const summary = buildChaseSummaryMeta(fullText, { stitcherPrinted, typeAText });
  if (!summary) return null;

  const year = defaultYear ?? inferStatementYear(fullText);
  const meta = {
    bankDisplayName: 'Chase',
    accountNumber: accountNumber ?? extractAccountNumber(fullText),
    openingBalance: summary.openingBalance,
    printedDeposits: summary.printedDeposits,
    printedWithdrawals: summary.printedWithdrawals,
    closingBalance: summary.closingBalance,
    statementYear: year
  };

  const normalized = mapPlumberRowsToChaseNormalized(plumberTransactions, year, { log: true });
  const transactions = mapToLedgerTransactions(normalized);
  const reconciliation = reconcileStatement(meta, transactions);
  const tierAOk = Boolean(reconciliation.checksumRecon?.ok);

  return {
    checksumOk: reconciliation.checksumOk || tierAOk,
    reconciliation,
    transactions,
    normalized,
    meta
  };
}

export default {

  PROFILE_ID,

  ChaseParseReconciliationError,

  detect,

  extractRaw,

  extract,

  extractSummary,

  buildChaseSummaryMeta,

  extractChasePrintedFromDocument,

  parseGluedInstanceAmount,

  pickLargestAmountAfterLabel,

  extractChaseSummarySlice,

  tryRecoverChaseFromPlumber,

  extractDetailTransactions,

  parseChaseRow,

  pickLastReasonableAmount,

  extractChaseDetailSection,

  injectChaseRowBreaks,

  mapPlumberRowsToChaseNormalized

};


