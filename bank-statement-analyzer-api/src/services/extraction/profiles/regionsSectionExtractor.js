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
// Standard grouped money: 1,234.56
const MONEY_TOKEN_RE = /\d{1,3}(?:,\d{3})*\.\d{2}/g;
// End-anchored standard grouped amount (may start mid-digit-run when refs glue).
const END_MONEY_RE = /(\d{1,3}(?:,\d{3})*\.\d{2})\s*$/;
// Prefer last comma-separated thousands group (33,000.00) over greedy 833,000.00 peel.
const END_COMMA_GROUP_RE = /(\d{1,3},\d{3}\.\d{2})\s*$/;
// Glued ref bleed: long digit run immediately before cents.
const LOOSE_END_MONEY_RE = /(\d+)\.(\d{2})\s*$/;
const AMOUNT_SANITY_CAP = 500_000;

/** Section keys aligned with regions_business_checking reconciliationSpec. */
export const REGIONS_SECTIONS = Object.freeze({
  DEPOSITS: 'deposits',
  WITHDRAWALS: 'withdrawals',
  CHECKS: 'checks',
  RETURNED_CHECKS: 'returnedChecks',
  FEES: 'fees'
});

function moneyToNum(token) {
  if (!token) return null;
  const n = Number(String(token).replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
}

/**
 * Strip date-glued money prefixes (e.g. "01/3117,238.53" → "17,238.53" candidate zone).
 * Leaves a clean trailing money token for the peels below.
 */
function stripDateGlue(line) {
  return String(line || '').replace(
    /(\d{1,2}\/\d{1,2})(\d[\d,]+\.\d{2})\s*$/,
    (_, date, money) => `${date} ${money}`
  );
}

function endMoney(line) {
  const s = stripDateGlue(String(line || '').trim());

  // Prefer last well-formed comma money when two amounts are glued
  // (e.g. "2,500.003,856.00" → take 3,856.00 not the fused token).
  const gluedDual = s.match(/(\d{1,3}(?:,\d{3})*\.\d{2})(\d{1,3}(?:,\d{3})*\.\d{2})\s*$/);
  if (gluedDual) {
    const second = moneyToNum(gluedDual[2]);
    if (second != null && second > 0 && second <= AMOUNT_SANITY_CAP) return second;
  }

  const trail = s.match(/([\d,]+\.\d{2})\s*$/);
  if (trail) {
    const trailStr = trail[1];
    if (trailStr.includes(',')) {
      const commaCandidates = [];
      const lastComma = trailStr.lastIndexOf(',');
      if (lastComma > 0) {
        const afterComma = trailStr.slice(lastComma + 1);
        const beforeComma = trailStr.slice(0, lastComma);
        if (/^\d{3}\.\d{2}$/.test(afterComma) && /^\d+$/.test(beforeComma)) {
          // Clean grouped amount: at most 3 digits before first thousands comma.
          if (beforeComma.length <= 3) {
            const clean = moneyToNum(`${beforeComma},${afterComma}`);
            if (clean != null && clean > 0 && clean <= AMOUNT_SANITY_CAP) {
              return clean;
            }
          } else {
            // Ref digits glued: "...86439833,000.00" → try 3,000 / 33,000 / 833,000; take min.
            for (const take of [1, 2, 3]) {
              if (beforeComma.length < take) continue;
              const dollars = beforeComma.slice(-take);
              if (take > 1 && dollars.startsWith('0')) continue;
              const n = moneyToNum(`${dollars},${afterComma}`);
              if (n != null && n > 0 && n <= AMOUNT_SANITY_CAP) {
                commaCandidates.push(n);
              }
            }
          }
        }
      }
      for (const m of trailStr.matchAll(/\d{1,3}(?:,\d{3})+\.\d{2}/g)) {
        const n = moneyToNum(m[0]);
        if (n != null && n > 0 && n <= AMOUNT_SANITY_CAP) commaCandidates.push(n);
      }
      if (commaCandidates.length) {
        return commaCandidates.reduce((min, n) => (n < min ? n : min));
      }
    }

    const loose = trailStr.match(/^(\d+)\.(\d{2})$/);
    if (loose) {
      const digits = loose[1];
      const cents = loose[2];
      const full = moneyToNum(`${digits}.${cents}`);
      const gluedBleed = digits.length > 7;
      if (
        !gluedBleed &&
        full != null &&
        full > 0 &&
        full <= AMOUNT_SANITY_CAP
      ) {
        return full;
      }
      const peelCandidates = [];
      for (const take of [3, 4, 5, 6, 7, 8]) {
        if (digits.length <= take) continue;
        const peeled = moneyToNum(`${digits.slice(-take)}.${cents}`);
        if (peeled != null && peeled > 0 && peeled <= AMOUNT_SANITY_CAP) {
          peelCandidates.push(peeled);
        }
      }
      if (peelCandidates.length) {
        return peelCandidates.reduce((min, n) => (n < min ? n : min));
      }
      if (full != null && full > 0 && full <= AMOUNT_SANITY_CAP) return full;
    }
  }

  const endGrouped = s.match(END_MONEY_RE);
  if (endGrouped) {
    const n = moneyToNum(endGrouped[1]);
    if (n != null && n > 0 && n <= AMOUNT_SANITY_CAP) return n;
  }

  return null;
}

/**
 * When Σ(section) exceeds the printed section total, drop bleed outliers
 * (glued raw lines / absurd size) until within band or fail closed (empty).
 */
function enforceSectionTotal(rows, printedTotal, { relativeTol = 0.02, absTol = 1 } = {}) {
  if (!Array.isArray(rows) || rows.length === 0) return rows;
  if (printedTotal == null || !Number.isFinite(Number(printedTotal))) return rows;
  const target = Number(printedTotal);
  const band = Math.max(absTol, Math.abs(target) * relativeTol);

  const sumAbs = (list) => list.reduce((s, r) => s + Math.abs(Number(r.amount) || 0), 0);
  let kept = [...rows];
  let sum = sumAbs(kept);
  if (sum <= target + band) return kept;

  const looksBleed = (row) => {
    const raw = String(row.rawLine || row.description || '');
    if (/\d{8,}[\d,]*\.\d{2}/.test(raw)) return true;
    if (/\d{6,},\d{3}\.\d{2}/.test(raw)) return true;
    const amt = Math.abs(Number(row.amount) || 0);
    return amt > target && target > 0;
  };

  const ranked = [...kept].sort(
    (a, b) => Math.abs(Number(b.amount) || 0) - Math.abs(Number(a.amount) || 0)
  );
  for (const outlier of ranked) {
    if (sum <= target + band) break;
    if (!looksBleed(outlier)) continue;
    kept = kept.filter((r) => r !== outlier);
    sum = sumAbs(kept);
  }

  // Still badly over: drop largest remaining until within band or empty.
  while (sum > target + band && kept.length) {
    const largest = kept.reduce((best, r) =>
      Math.abs(Number(r.amount) || 0) > Math.abs(Number(best.amount) || 0) ? r : best
    );
    kept = kept.filter((r) => r !== largest);
    sum = sumAbs(kept);
  }

  return kept;
}

/**
 * Classify a physical line as a section header. Returns a section key or null.
 * @param {string} line
 * @returns {string|null}
 */
function detectSectionHeader(line) {
  const s = line.trim();
  if (/^DEPOSITS\s*&\s*CREDITS\b/i.test(s)) return REGIONS_SECTIONS.DEPOSITS;
  // Must precede /^CHECKS\b/ — "RETURNED CHECKS" is a credit section.
  if (/^RETURNED\s+CHECKS\b/i.test(s)) return REGIONS_SECTIONS.RETURNED_CHECKS;
  if (/^WITHDRAWALS\b/i.test(s)) return REGIONS_SECTIONS.WITHDRAWALS;
  if (/^FEES\b/i.test(s)) return REGIONS_SECTIONS.FEES;
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
  if (/^Total\s+(Deposits|Withdrawals|Checks|Returned\s+Checks|Fees)\b/i.test(s)) return true;
  if (/^Date\s*Check\s*No\.?\s*Amount/i.test(s)) return true;
  if (/^Date\s*Balance/i.test(s)) return true;
  if (/^DateCheck/i.test(s)) return true;
  if (/^DateBalance/i.test(s)) return true;
  if (/^Thank\s+You\s+For\s+Banking/i.test(s)) return true;
  if (
    /\(CONTINUED\)/i.test(s) &&
    !/^(DEPOSITS|WITHDRAWALS|CHECKS|RETURNED\s+CHECKS|FEES)\b/i.test(s)
  ) {
    return true;
  }
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
    checks: grab(/Total\s+Checks\s*\$?\s*([\d,]+\.\d{2})/i),
    returnedChecks: grab(/Total\s+Returned\s+Checks\s*\$?\s*([\d,]+\.\d{2})/i),
    fees: grab(/Total\s+Fees\s*\$?\s*([\d,]+\.\d{2})/i)
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
    [REGIONS_SECTIONS.CHECKS]: [],
    [REGIONS_SECTIONS.RETURNED_CHECKS]: [],
    [REGIONS_SECTIONS.FEES]: []
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

    const role =
      section === REGIONS_SECTIONS.DEPOSITS || section === REGIONS_SECTIONS.RETURNED_CHECKS
        ? 'credit'
        : 'debit';
    const row = parseActivityLine(line, yr, role, section);
    if (row) bySection[section].push(row);
  }

  const sectionTotals = parseRegionsSectionTotals(t);

  bySection[REGIONS_SECTIONS.DEPOSITS] = enforceSectionTotal(
    bySection[REGIONS_SECTIONS.DEPOSITS],
    sectionTotals.deposits
  );
  bySection[REGIONS_SECTIONS.WITHDRAWALS] = enforceSectionTotal(
    bySection[REGIONS_SECTIONS.WITHDRAWALS],
    sectionTotals.withdrawals
  );
  bySection[REGIONS_SECTIONS.CHECKS] = enforceSectionTotal(
    bySection[REGIONS_SECTIONS.CHECKS],
    sectionTotals.checks
  );
  bySection[REGIONS_SECTIONS.RETURNED_CHECKS] = enforceSectionTotal(
    bySection[REGIONS_SECTIONS.RETURNED_CHECKS],
    sectionTotals.returnedChecks
  );
  bySection[REGIONS_SECTIONS.FEES] = enforceSectionTotal(
    bySection[REGIONS_SECTIONS.FEES],
    sectionTotals.fees
  );

  const transactions = [
    ...bySection[REGIONS_SECTIONS.DEPOSITS],
    ...bySection[REGIONS_SECTIONS.RETURNED_CHECKS],
    ...bySection[REGIONS_SECTIONS.WITHDRAWALS],
    ...bySection[REGIONS_SECTIONS.FEES],
    ...bySection[REGIONS_SECTIONS.CHECKS]
  ];

  return {
    transactions,
    bySection,
    sectionTotals
  };
}

/**
 * Reject rows whose absolute amount exceeds the printed section total
 * (impossible on a real statement — always bleed / glued balance).
 * @param {Array<object>} rows
 * @param {number|null} printedTotal
 */
export function dropRowsExceedingSectionTotal(rows, printedTotal) {
  if (printedTotal == null || !Number.isFinite(Number(printedTotal))) return rows ?? [];
  const cap = Number(printedTotal) + 0.01;
  return (rows ?? []).filter((r) => Math.abs(Number(r.amount) || 0) <= cap);
}

export { enforceSectionTotal };

export default {
  parseRegionsSections,
  parseRegionsSectionTotals,
  dropRowsExceedingSectionTotal,
  enforceSectionTotal,
  REGIONS_SECTIONS
};
