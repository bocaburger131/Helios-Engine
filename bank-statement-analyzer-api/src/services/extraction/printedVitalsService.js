/**
 * Shared printed summary vitals for digital PDF profiles (document totals + stitcher merge).
 */

const MONEY_TOKEN_RE = /-?\$?\s*\(?-?\s*((?:\d{1,3}(?:,\d{3})*|\d+)\.\d{2})\)?/g;

export function normalizePrintedText(text) {
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
 * Parse balance after summary labels (handles glued instance counts and negatives).
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

/**
 * Parse glued INSTANCES tail (e.g. Additions3050,604.44 → 50,604.44).
 */
export function parseGluedInstanceAmount(tail) {
  const cleaned = String(tail || '').trimStart().replace(/^-\s*/, '');
  const blob = cleaned.match(/^(\d[\d,]*\.\d{2})/);
  if (!blob) return null;
  const raw = blob[1];
  const candidates = [];
  for (let peel = 1; peel <= 4 && peel < raw.length; peel++) {
    const rest = raw.slice(peel);
    if (!/^[\d,]+\.\d{2}$/.test(rest)) continue;
    const amt = moneyToNumber(rest);
    if (amt == null || amt < 1 || amt > 500_000) continue;
    const instDigits = Number(raw.slice(0, peel).replace(/\D/g, '')) || 0;
    if (instDigits > 9999) continue;
    const hasThousandsComma = /,\d{3}\./.test(rest);
    candidates.push({ amt: Math.abs(amt), peel, hasThousandsComma, instDigits });
  }
  if (!candidates.length) {
    const fallback = moneyToNumber(raw);
    return fallback != null && fallback <= 500_000 ? Math.abs(fallback) : null;
  }
  const plausible = candidates.filter((c) => c.amt >= 1000 && c.amt <= 200_000);
  const pool = plausible.length ? plausible : candidates.filter((c) => c.amt <= 500_000);
  pool.sort((a, b) => {
    if (a.hasThousandsComma !== b.hasThousandsComma) return a.hasThousandsComma ? -1 : 1;
    return b.amt - a.amt;
  });
  return pool[0]?.amt ?? null;
}

function amountAfterSectionLabel(text, labelRe) {
  const t = String(text || '');
  const m = t.match(labelRe);
  if (!m || m.index == null) return null;
  const tailLine = t.slice(m.index + m[0].length, m.index + m[0].length + 32).split('\n')[0];
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

function sumWithdrawalSections(t) {
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

/**
 * Document-wide printed totals (last Total … match wins).
 * @param {string} text
 * @param {{ summarySlice?: (t: string) => string }} [opts]
 */
export function extractDocumentPrintedTotals(text, opts = {}) {
  const t = normalizePrintedText(text);
  const totalDepMatches = [
    ...t.matchAll(/Total\s+Deposits?\s+and\s+Additions?\s+\$?\s*([\d,]+\.\d{2})/gi)
  ];
  let printedDeposits = null;
  if (totalDepMatches.length) {
    printedDeposits = moneyToNumber(totalDepMatches[totalDepMatches.length - 1][1]);
  }

  const slice = opts.summarySlice ? opts.summarySlice(t) : t.slice(0, 4500);
  let printedWithdrawals = sumWithdrawalSections(slice);
  if (printedWithdrawals == null) {
    const wdParts = [];
    for (const re of [
      /Total\s+Checks?\s+Paid\s+\$?\s*([\d,]+\.\d{2})/gi,
      /Total\s+Electronic\s+Withdrawals?\s+\$?\s*-?\s*\$?\s*([\d,]+\.\d{2})/gi,
      /Total\s+Other\s+Withdrawals?\s+\$?\s*-?\s*\$?\s*([\d,]+\.\d{2})/gi,
      /Total\s+Fees?\s+\$?\s*-?\s*\$?\s*([\d,]+\.\d{2})/gi
    ]) {
      const hits = [...t.matchAll(re)];
      if (hits.length) {
        const n = moneyToNumber(hits[hits.length - 1][1]);
        if (n != null) wdParts.push(Math.abs(n));
      }
    }
    if (wdParts.length) printedWithdrawals = wdParts.reduce((s, n) => s + n, 0);
  }

  const openingBalance =
    parseLabeledBalance('Beginning\\s+Balance', slice) ??
    parseLabeledBalance('Beginning\\s+Balance', t);
  const closingBalance =
    parseLabeledBalance('Ending\\s+Balance', slice) ?? parseLabeledBalance('Ending\\s+Balance', t);

  if (
    openingBalance == null &&
    closingBalance == null &&
    printedDeposits == null &&
    printedWithdrawals == null
  ) {
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
 * Slice the printed SUMMARY block: from the SUMMARY heading through the
 * Ending/Closing Balance line. Falls back to a leading window.
 * @param {string} t — already normalized text
 * @returns {string}
 */
function sliceSummaryBlock(t) {
  const sIdx = t.search(/\bsummary\b/i);
  const start = sIdx >= 0 ? sIdx : 0;
  const window = t.slice(start, start + 2500);
  const endMatch = window.match(/(ending|closing)\s+balance[^\n]*\n?/i);
  if (endMatch && endMatch.index != null) {
    return window.slice(0, endMatch.index + endMatch[0].length);
  }
  return window.slice(0, 1500);
}

/**
 * First money token on a single line (ignores trailing +/- sign markers).
 * @param {string} line
 * @returns {number|null}
 */
function firstMoneyOnLine(line) {
  const m = String(line || '').match(/(-?\(?\$?\s*[\d,]+\.\d{2}\)?)/);
  if (!m) return null;
  const n = moneyToNumber(m[1]);
  return n == null ? null : n;
}

/**
 * Parse the SUMMARY box into a structured printedLines map using a profile's
 * reconciliation spec. Labels are matched at the start of each physical line so
 * generic labels ("Checks") never capture specific ones ("Returned Checks").
 *
 * @param {string} text
 * @param {{ summaryLines: Array<{key:string, labels:RegExp[], role:'credit'|'debit', optional?:boolean}> }} spec
 * @param {{ summarySlice?: string }} [opts]
 * @returns {{
 *   openingBalance: number|null,
 *   closingBalance: number|null,
 *   printedLines: Record<string, number>,
 *   lineRoles: Record<string, 'credit'|'debit'>
 * }}
 */
export function parseSummaryLines(text, spec, opts = {}) {
  const t = normalizePrintedText(text);
  const slice = opts.summarySlice ?? sliceSummaryBlock(t);
  const lines = slice
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

  const printedLines = {};
  const lineRoles = {};
  const usedLineIdx = new Set();

  for (const def of spec?.summaryLines ?? []) {
    for (let i = 0; i < lines.length; i++) {
      if (usedLineIdx.has(i)) continue;
      const line = lines[i];
      const matched = def.labels.some((re) => new RegExp(`^${re.source}`, re.flags).test(line));
      if (!matched) continue;
      const amt = firstMoneyOnLine(line);
      if (amt == null) continue;
      printedLines[def.key] = Math.abs(amt);
      lineRoles[def.key] = def.role;
      usedLineIdx.add(i);
      break;
    }
  }

  const openingBalance =
    parseLabeledBalance('Beginning\\s+Balance', slice) ??
    parseLabeledBalance('Opening\\s+Balance', slice) ??
    parseLabeledBalance('Beginning\\s+Balance', t);
  const closingBalance =
    parseLabeledBalance('Ending\\s+Balance', slice) ??
    parseLabeledBalance('Closing\\s+Balance', slice) ??
    parseLabeledBalance('Ending\\s+Balance', t);

  return { openingBalance, closingBalance, printedLines, lineRoles };
}

/**
 * Collapse a printedLines map into legacy two-bucket aggregates using spec roles.
 * @param {Record<string, number>} printedLines
 * @param {{ summaryLines: Array<{key:string, role:'credit'|'debit'}> }} spec
 * @returns {{ printedDeposits: number|null, printedWithdrawals: number|null }}
 */
export function summarizePrintedLines(printedLines, spec) {
  if (!printedLines || !spec?.summaryLines) {
    return { printedDeposits: null, printedWithdrawals: null };
  }
  let credit = 0;
  let debit = 0;
  let hasCredit = false;
  let hasDebit = false;
  for (const def of spec.summaryLines) {
    const v = printedLines[def.key];
    if (v == null || !Number.isFinite(Number(v))) continue;
    if (def.role === 'credit') {
      credit += Math.abs(Number(v));
      hasCredit = true;
    } else if (def.role === 'debit') {
      debit += Math.abs(Number(v));
      hasDebit = true;
    }
  }
  return {
    printedDeposits: hasCredit ? Number(credit.toFixed(2)) : null,
    printedWithdrawals: hasDebit ? Number(debit.toFixed(2)) : null
  };
}

/** Fill only null vitals from stitcher — never override document totals. */
export function mergePrintedWithStitcher(summary, stitcherPrinted) {
  if (!summary && !stitcherPrinted) return null;
  const s = summary || {};
  const st = stitcherPrinted || {};
  return {
    openingBalance: s.openingBalance ?? st.opening ?? null,
    closingBalance: s.closingBalance ?? st.closing ?? null,
    printedDeposits: s.printedDeposits ?? st.totalDeposits ?? st.printedDeposits ?? null,
    printedWithdrawals:
      s.printedWithdrawals ?? st.totalWithdrawals ?? st.printedWithdrawals ?? null
  };
}

export default {
  normalizePrintedText,
  moneyToNumber,
  parseLabeledBalance,
  parseGluedInstanceAmount,
  extractDocumentPrintedTotals,
  mergePrintedWithStitcher,
  parseSummaryLines,
  summarizePrintedLines
};
