/**
 * Section-aware text extractor for Regions LifeGreen Business Checking.
 *
 * Walks the statement's labeled sections (DEPOSITS & CREDITS, WITHDRAWALS,
 * CHECKS) and emits one signed, section-tagged ledger. Amounts are glued to
 * trailing reference/MCC digits in pdf-parse output, but Regions always prints
 * thousands separators, so an end-anchored comma-aware money token reliably
 * recovers the true amount (e.g. "...1225125.00" → 125.00, "...86439833,000.00"
 * → 3,000.00). The CHECKS grid (Date / Check No. / Amount, incl. "*" break-in-
 * sequence markers) is parsed by its own column rule.
 */

import { normalizePrintedText } from '../printedVitalsService.js';

const DATE_PREFIX_RE = /^(\d{1,2}\/\d{1,2})/;
// End-anchored amount: max valid grouped money suffix on the line.
const END_MONEY_RE = /(\d{1,3}(?:,\d{3})*\.\d{2})\s*$/;

/** Section keys aligned with regions_business_checking reconciliationSpec. */
export const REGIONS_SECTIONS = Object.freeze({
  DEPOSITS: 'deposits',
  WITHDRAWALS: 'withdrawals',
  CHECKS: 'checks'
});

function moneyToNum(token) {
  if (!token) return null;
  const n = Number(String(token).replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
}

function endMoney(line) {
  const m = String(line || '').match(END_MONEY_RE);
  return m ? moneyToNum(m[1]) : null;
}

/**
 * Classify a physical line as a section header. Returns a section key or null.
 * @param {string} line
 * @returns {string|null}
 */
function detectSectionHeader(line) {
  const s = line.trim();
  if (/^DEPOSITS\s*&\s*CREDITS\b/i.test(s)) return REGIONS_SECTIONS.DEPOSITS;
  if (/^WITHDRAWALS\b/i.test(s)) return REGIONS_SECTIONS.WITHDRAWALS;
  if (/^CHECKS\b/i.test(s)) return REGIONS_SECTIONS.CHECKS;
  // Hard stops: end of transaction zone.
  if (/^DAILY\s+BALANCE\s+SUMMARY\b/i.test(s)) return '__end__';
  if (/^Easy\s+Steps\s+to\s+Balance/i.test(s)) return '__end__';
  return null;
}

/** Lines that are page furniture / totals / column headers — never rows. */
function isNoiseLine(line) {
  const s = line.trim();
  if (!s) return true;
  if (/^Total\s+(Deposits|Withdrawals|Checks)\b/i.test(s)) return true;
  if (/^Date\s*Check\s*No\.?\s*Amount/i.test(s)) return true;
  if (/^Date\s*Balance/i.test(s)) return true;
  if (/^DateCheck/i.test(s)) return true;
  if (/^DateBalance/i.test(s)) return true;
  if (/^Thank\s+You\s+For\s+Banking/i.test(s)) return true;
  if (/\(CONTINUED\)/i.test(s)) return true;
  if (/^\*\s*Break\s+In/i.test(s)) return true;
  return false;
}

/**
 * Parse a single CHECKS grid line: date + check number (+ "*") + amount.
 * @param {string} line
 * @param {number} year
 * @returns {{date:string, description:string, amount:number, section:string, rawLine:string}|null}
 */
function parseCheckLine(line, year) {
  const s = line.trim();
  const dm = s.match(DATE_PREFIX_RE);
  if (!dm) return null;
  const amount = endMoney(s);
  if (amount == null) return null;
  const afterDate = s.slice(dm[1].length);
  const withoutAmount = afterDate.replace(END_MONEY_RE, '');
  const breakSeq = /\*/.test(withoutAmount);
  const checkNo = (withoutAmount.match(/\d+/) || [null])[0];
  if (!checkNo) return null;
  return {
    date: `${dm[1]}/${year}`,
    description: `Check ${checkNo}${breakSeq ? ' (break in sequence)' : ''}`,
    amount: -Math.abs(amount),
    section: REGIONS_SECTIONS.CHECKS,
    checkNo,
    breakInSequence: breakSeq,
    rawLine: s
  };
}

/**
 * Parse a deposit/withdrawal row: date + description + trailing amount.
 * @param {string} line
 * @param {number} year
 * @param {'credit'|'debit'} role
 * @param {string} section
 */
function parseActivityLine(line, year, role, section) {
  const s = line.trim();
  const dm = s.match(DATE_PREFIX_RE);
  if (!dm) return null;
  const amount = endMoney(s);
  if (amount == null || amount === 0) return null;
  const description = s
    .slice(dm[1].length)
    .replace(END_MONEY_RE, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
  const signed = role === 'credit' ? Math.abs(amount) : -Math.abs(amount);
  return {
    date: `${dm[1]}/${year}`,
    description: description || section,
    amount: signed,
    section,
    rawLine: s
  };
}

/**
 * Parse the printed per-section totals ("Total Deposits & Credits $X", ...).
 * @param {string} text
 * @returns {{deposits:number|null, withdrawals:number|null, checks:number|null}}
 */
export function parseRegionsSectionTotals(text) {
  const t = normalizePrintedText(text);
  const grab = (re) => {
    const m = t.match(re);
    return m ? moneyToNum(m[1]) : null;
  };
  return {
    deposits: grab(/Total\s+Deposits\s*&\s*Credits\s*\$?\s*([\d,]+\.\d{2})/i),
    withdrawals: grab(/Total\s+Withdrawals\s*\$?\s*([\d,]+\.\d{2})/i),
    checks: grab(/Total\s+Checks\s*\$?\s*([\d,]+\.\d{2})/i)
  };
}

/**
 * Walk every Regions section and return a signed, section-tagged ledger.
 * @param {string} text
 * @param {number} year
 * @returns {{
 *   transactions: Array<object>,
 *   bySection: Record<string, Array<object>>,
 *   sectionTotals: { deposits:number|null, withdrawals:number|null, checks:number|null }
 * }}
 */
export function parseRegionsSections(text, year) {
  const t = normalizePrintedText(text);
  const lines = t.split('\n');
  const yr = Number(year) || new Date().getFullYear();

  const bySection = {
    [REGIONS_SECTIONS.DEPOSITS]: [],
    [REGIONS_SECTIONS.WITHDRAWALS]: [],
    [REGIONS_SECTIONS.CHECKS]: []
  };

  let section = null;
  let ended = false;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    const header = detectSectionHeader(line);
    if (header === '__end__') {
      ended = true;
      section = null;
      continue;
    }
    if (header) {
      section = header;
      continue;
    }
    if (ended || !section) continue;
    if (isNoiseLine(line)) continue;
    if (!DATE_PREFIX_RE.test(line)) continue;

    if (section === REGIONS_SECTIONS.CHECKS) {
      const row = parseCheckLine(line, yr);
      if (row) bySection[REGIONS_SECTIONS.CHECKS].push(row);
      continue;
    }

    const role = section === REGIONS_SECTIONS.DEPOSITS ? 'credit' : 'debit';
    const row = parseActivityLine(line, yr, role, section);
    if (row) bySection[section].push(row);
  }

  const transactions = [
    ...bySection[REGIONS_SECTIONS.DEPOSITS],
    ...bySection[REGIONS_SECTIONS.WITHDRAWALS],
    ...bySection[REGIONS_SECTIONS.CHECKS]
  ];

  return {
    transactions,
    bySection,
    sectionTotals: parseRegionsSectionTotals(t)
  };
}

export default { parseRegionsSections, parseRegionsSectionTotals, REGIONS_SECTIONS };
