/**
 * Wells Fargo Initiate Business Checking — Layer 1 text + Layer 2 verb classifier.
 */
import { normalizeTransactionForLedger } from '../../../utils/transactionNormalization.js';
import { reconcileStatement } from '../statementReconciliation.js';
import logger from '../../../utils/logger.js';

export const PROFILE_ID = 'wells_initiate_checking';

const DATE_GROUP_START_RE = /^(\d{1,2}\/\d{1,2})(?:\s+(\d{3,6}))?\s+(.+)$/i;
const MONEY_ONLY_LINE_RE = /^[\s$(),.\d-]+$/;
const SKIP_LINE_RE =
  /^(?:date\s+check|deposits?\/\s*credits?|withdrawals?\/\s*debits?|ending\s+daily|transaction\s+history|totals?\b)/i;
const MONEY_TOKEN_RE = /[\d,]+\.\d{2}/g;
const BALANCE_SEPARATION_MIN_GAP = 3;

/** Glued row: MM/DD [check] DESC amount endingDailyBalance */
const WELLS_ROW_TRAILING_BALANCE_RE =
  /^(\d{1,2}\/\d{1,2})\s+(?:(\d{3,6})\s+)?(.+?)\s+([\d,]+\.\d{2})\s+([\d,]+\.\d{2})\s*$/;

const HEADER_STRIP_RES = [
  /Transaction History \(continued\)/gi,
  /Transaction history \(continued\)/gi,
  /Date Check Number Description Deposits\/ Credits Withdrawals\/ Debits Ending daily balance/gi,
  /Date Check Number Description Deposits\/Credits Withdrawals\/Debits Ending daily balance/gi
];

export class WellsParseReconciliationError extends Error {
  /**
   * @param {object} reconciliation
   * @param {object} [partial] — meta, transactions, normalizedTransactions, rows
   */
  constructor(reconciliation, partial = null) {
    super('Wells Initiate: reconciliation failed against printed monthly totals');
    this.name = 'WellsParseReconciliationError';
    this.reconciliation = reconciliation;
    this.partial = partial;
  }
}

/**
 * Wells Initiate rows always end with Ending daily balance — strip from txn amounts.
 * @param {Array<{ value: number|null, index: number }>} nums
 */
export function stripWellsAmountTokens(nums) {
  if (!nums?.length) return { amountTokens: [], endingDailyBalance: null };
  if (nums.length === 1) {
    return { amountTokens: nums, endingDailyBalance: null };
  }
  return {
    amountTokens: nums.slice(0, -1),
    endingDailyBalance: nums[nums.length - 1].value
  };
}

/**
 * Prefer Wells profile partial extract over legacy when drift is tolerable vs printed totals.
 * @param {object} params
 */
export function tryRecoverWellsNearMiss(params = {}) {
  const { reconciliation, meta, transactions, normalizedTransactions } = params;
  if (!reconciliation || !Array.isArray(transactions) || transactions.length === 0) {
    return null;
  }

  const printedDep = Number(reconciliation.printedDeposits) || 0;
  const parsedDep = Number(reconciliation.parsedDeposits) || 0;
  const depDrift = Math.abs(parsedDep - printedDep);
  const depDriftPct = printedDep > 0 ? depDrift / printedDep : depDrift > 0 ? 1 : 0;
  const closeDrift = Math.abs(
    Number(reconciliation.computedClosing) - Number(reconciliation.closing)
  );

  const nearMiss = depDriftPct < 0.05 && closeDrift < 500;
  const beatsLegacy = depDriftPct < 1.0;

  if (!nearMiss && !beatsLegacy) {
    return null;
  }

  return {
    meta,
    transactions,
    normalizedTransactions,
    reconciliation,
    checksumOk: Boolean(reconciliation.checksumOk),
    nearMiss: nearMiss && !reconciliation.checksumOk,
    beatsLegacy
  };
}

export function detect(text) {
  const t = String(text || '');
  if (!/initiate business checking/i.test(t)) return 0;
  let score = 0.85;
  if (/transaction\s+history/i.test(t)) score += 0.05;
  if (/deposits\/credits/i.test(t) && /withdrawals\/debits/i.test(t)) score += 0.05;
  if (/wells\s+fargo/i.test(t)) score += 0.05;
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
  const n = Number(String(s).replace(/[$,]/g, '').trim());
  return Number.isFinite(n) ? n : null;
}

export function inferStatementYear(text, periodEndToken) {
  const yearMatch = String(text || '').match(/\b(20\d{2})\b/g);
  if (yearMatch?.length) return Number(yearMatch[yearMatch.length - 1]);
  if (periodEndToken) {
    const m = String(text).match(
      new RegExp(`${periodEndToken.replace(/\//g, '\\/')}[^\\n]{0,80}\\b(20\\d{2})\\b`, 'i')
    );
    if (m) return Number(m[1]);
  }
  return new Date().getFullYear();
}

/**
 * Resolve calendar year for a MM/DD posted date within a statement period.
 * Handles month rollover (Dec statement with Jan rows → next year).
 * @param {string} mmdd
 * @param {string} [periodStartToken]
 * @param {string} [periodEndToken]
 * @param {number} statementYear
 * @returns {number}
 */
export function resolvePostedYear(mmdd, periodStartToken, periodEndToken, statementYear) {
  const [m] = String(mmdd || '').split('/').map(Number);
  const [peM] = String(periodEndToken || '').split('/').map(Number);
  const [psM] = String(periodStartToken || '').split('/').map(Number);
  if (!Number.isFinite(m) || !Number.isFinite(statementYear)) return statementYear;

  // Dec-ending statement: Jan–Mar rows belong to the following calendar year
  if (peM === 12 && m >= 1 && m <= 3) return statementYear + 1;
  // Jan/Feb statement: Oct–Dec rows belong to the previous calendar year
  if (Number.isFinite(peM) && peM <= 2 && m >= 10) return statementYear - 1;
  if (Number.isFinite(psM) && psM === 1 && peM <= 2 && m >= 10) return statementYear - 1;

  return statementYear;
}

/**
 * True when line begins a new posted-date transaction group (not a bare amount line).
 * @param {string} line
 */
export function isDateGroupRowStart(line) {
  const trimmed = String(line || '').trim();
  if (!trimmed) return false;
  if (SKIP_LINE_RE.test(trimmed)) return false;
  if (MONEY_ONLY_LINE_RE.test(trimmed)) return false;

  const m = trimmed.match(DATE_GROUP_START_RE);
  if (!m) return false;

  const afterDate = (m[3] || '').trim();
  if (!afterDate) return false;
  if (MONEY_ONLY_LINE_RE.test(afterDate)) return false;

  return true;
}

/**
 * Ordered explicit Wells verb classifiers.
 * @param {string} description
 * @returns {{ direction: 'credit'|'debit', explicit: boolean }}
 */
export function classifyWellsDescription(description) {
  const d = String(description || '').trim();
  const lower = d.toLowerCase();

  const credit = (direction) => ({ direction, explicit: true });
  const debit = (direction) => ({ direction, explicit: true });

  if (/transfer\s+from|online\s+transfer\s+from/i.test(d)) {
    return credit('credit');
  }
  if (/transfer\s+to|online\s+transfer\s+to/i.test(d)) {
    return debit('debit');
  }
  if (/purchase\s+return/i.test(d)) {
    return credit('credit');
  }
  if (/recurring\s+payment\s+reversal/i.test(d)) {
    return credit('credit');
  }
  if (/^check$/i.test(d.trim()) || /^\d{3,6}\s+check\b/i.test(d)) {
    return debit('debit');
  }
  if (/atm\s+withdrawal/i.test(d)) {
    return debit('debit');
  }
  if (/\bfee\b|service\s+charge|maintenance\s+fee|nsf\s+fee|overdraft/i.test(lower)) {
    return debit('debit');
  }
  if (/purchase\s+authorized|recurring\s+payment\s+authorized/i.test(d)) {
    return debit('debit');
  }
  if (
    /instant\s+pmt\s+from|instant\s+pmt|pmt\s+from|mobile\s+deposit|remote\s+deposit|direct\s+dep|ach\s+credit|ach\s+deposit|deposit|payroll|wire\s+in|payment\s+from|paypal\s+transfer|money\s+transfer\s+from|merchant\s+dep|seller\s+proceed|square\s+inc|stripe|shopify|clover|toast|zelle\s+from|venmo\s+cashout|received\s+from|credited|credit\s+for|settlement/i.test(
      lower
    )
  ) {
    return credit('credit');
  }

  return { direction: 'debit', explicit: false };
}

function hasDebitKeyword(description) {
  const lower = String(description || '').toLowerCase();
  return /purchase|withdraw|transfer\s+to|atm|fee|service\s+charge|check\b|payment\s+authorized|recurring\s+payment\s+auth|debit\s+card/i.test(
    lower
  );
}

function isMeaningfulAmount(value) {
  return value != null && Number.isFinite(value) && Math.abs(value) >= 0.01;
}

/**
 * Wells rows use separate Deposits/Credits and Withdrawals/Debits columns.
 * When only one side has a value, the amount's horizontal position in the line
 * indicates which column (deposit=left, withdrawal=right).
 * @param {string} rest
 * @param {number} amountIndex
 * @returns {'credit'|'debit'|null}
 */
export function inferDirectionFromAmountPosition(rest, amountIndex) {
  if (!rest || amountIndex <= 0) return null;
  const ratio = amountIndex / rest.length;
  if (ratio >= 0.55) return 'debit';
  if (ratio <= 0.45) return 'credit';
  return null;
}

/**
 * Assign credit/debit from Wells dual-column layout (after balance column stripped).
 * @param {Array<{ value: number|null, index: number }>} amountTokens
 * @param {string} description
 * @param {string} rest — line text after date (for column position)
 * @returns {{ credit: number|null, debit: number|null, amount: number|null, direction: string|null }}
 */
export function assignWellsColumnAmounts(amountTokens, description, rest) {
  if (!amountTokens?.length) {
    return { credit: null, debit: null, amount: null, direction: null };
  }

  if (amountTokens.length === 1) {
    const amt = amountTokens[0].value;
    const classified = classifyWellsDescription(description);
    let direction = classified.direction;
    if (!classified.explicit) {
      if (!hasDebitKeyword(description)) {
        direction = 'credit';
      } else {
        const posHint = inferDirectionFromAmountPosition(rest, amountTokens[0].index);
        if (posHint) direction = posHint;
      }
    }

    if (direction === 'credit') {
      return { credit: amt, debit: null, amount: amt, direction: 'credit' };
    }
    return { credit: null, debit: amt, amount: amt != null ? -Math.abs(amt) : null, direction: 'debit' };
  }

  const depVal = amountTokens[0]?.value;
  const wdVal = amountTokens[1]?.value;
  const hasDep = isMeaningfulAmount(depVal);
  const hasWd = isMeaningfulAmount(wdVal);

  if (hasDep && !hasWd) {
    return { credit: depVal, debit: null, amount: depVal, direction: 'credit' };
  }
  if (hasWd && !hasDep) {
    return { credit: null, debit: wdVal, amount: -Math.abs(wdVal), direction: 'debit' };
  }
  if (hasDep && hasWd) {
    const { direction } = classifyWellsDescription(description);
    if (direction === 'credit') {
      return { credit: depVal, debit: null, amount: depVal, direction: 'credit' };
    }
    return { credit: null, debit: wdVal, amount: -Math.abs(wdVal), direction: 'debit' };
  }

  return { credit: null, debit: null, amount: null, direction: null };
}

export function extractSummary(text) {
  const summaryRegex =
    /Beginning balance on\s+(\d{1,2}\/\d{1,2})\s+\$?\s*([\d,]+\.\d{2})[\s\S]*?Deposits\/Credits\s+([\d,]+\.\d{2})[\s\S]*?Withdrawals\/Debits\s+-\s*([\d,]+\.\d{2})[\s\S]*?Ending balance on\s+(\d{1,2}\/\d{1,2})\s+\$?\s*([\d,]+\.\d{2})/i;

  const m = String(text || '').match(summaryRegex);
  if (!m) return null;

  return {
    periodStartToken: m[1],
    openingBalance: moneyToNumber(m[2]),
    printedDeposits: moneyToNumber(m[3]),
    printedWithdrawals: moneyToNumber(m[4]),
    periodEndToken: m[5],
    closingBalance: moneyToNumber(m[6])
  };
}

export function extractAccountNumber(text) {
  const m = String(text || '').match(/Account number:\s*(\d{6,})/i);
  return m ? m[1] : null;
}

const SECTION_END_RES = [
  // Require amount pair on Totals row — bare "Totals" appears on continued pages and truncates early
  /\bTotals\s+[\d,]+\.\d{2}\s+[\d,]+\.\d{2}/i,
  /\bDaily\s+balance\s+summary/i,
  /\bInterest\s+summary/i,
  /\bService\s+charge\s+summary/i
];

/**
 * Pick text that contains a sliceable Transaction history block (Type B body often cleaner).
 * @param {string} fullText
 * @param {string} [typeBText]
 * @returns {string}
 */
export function pickWellsExtractionText(fullText, typeBText) {
  const candidates = [typeBText, fullText].filter((t) => String(t || '').trim().length > 0);
  for (const raw of candidates) {
    const normalized = normalizeSpaces(raw);
    if (extractTransactionSection(normalized)) return normalized;
  }
  return normalizeSpaces(fullText || typeBText || '');
}

export function extractTransactionSection(text) {
  const normalized = normalizeSpaces(text);
  const start = normalized.search(/transaction\s+history/i);
  if (start < 0) return null;

  const tail = normalized.slice(start);
  let end = normalized.length;
  for (const re of SECTION_END_RES) {
    const m = tail.match(re);
    if (m?.index != null && m.index > 0) {
      end = Math.min(end, start + m.index);
    }
  }

  if (end <= start) return null;

  let body = normalized.slice(start, end);
  for (const re of HEADER_STRIP_RES) {
    body = body.replace(re, '\n');
  }
  return body.trim();
}

/**
 * Split section into logical rows; only isDateGroupRowStart opens a new row.
 * @param {string} section
 */
export function splitRows(section) {
  const lines = String(section || '')
    .split('\n')
    .map((x) => x.trim())
    .filter(Boolean);

  const rows = [];
  let current = null;

  for (const line of lines) {
    if (isDateGroupRowStart(line)) {
      if (current) rows.push(current.trim());
      current = line;
    } else if (current) {
      current += ` ${line}`;
    }
  }
  if (current) rows.push(current.trim());
  return rows;
}

export function normalizeDate(mmdd, year) {
  const [m, d] = String(mmdd).split('/').map(Number);
  return `${year}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/**
 * Extract trailing daily balance from raw line (last money token if separated from txn amount).
 * @param {string} rawLine
 * @returns {number|null}
 */
export function extractTrailingDailyBalance(rawLine) {
  const matches = [...String(rawLine || '').matchAll(MONEY_TOKEN_RE)].map((m) => ({
    value: moneyToNumber(m[0]),
    index: m.index ?? 0
  }));
  if (matches.length < 2) return null;
  const last = matches[matches.length - 1];
  const prev = matches[matches.length - 2];
  if (last.index - prev.index >= BALANCE_SEPARATION_MIN_GAP) {
    return last.value;
  }
  return null;
}

export function parseRow(row, year, periodContext = null) {
  const dateMatch = row.match(/^(\d{1,2}\/\d{1,2})\s+([\s\S]*)$/);
  if (!dateMatch) return null;

  const postedToken = dateMatch[1];
  const effectiveYear =
    periodContext != null
      ? resolvePostedYear(
          postedToken,
          periodContext.periodStartToken,
          periodContext.periodEndToken,
          year
        )
      : year;
  let rest = dateMatch[2].trim();

  const gluedMatch = `${postedToken} ${rest}`.match(WELLS_ROW_TRAILING_BALANCE_RE);
  if (gluedMatch) {
    const checkNum = gluedMatch[2] || null;
    const description = gluedMatch[3].trim();
    const txnAmt = moneyToNumber(gluedMatch[4]);
    const dailyBal = moneyToNumber(gluedMatch[5]);
    const { credit, debit, amount, direction } = assignWellsColumnAmounts(
      [{ value: txnAmt, index: 0 }],
      description,
      rest
    );
    return {
      postedDate: normalizeDate(postedToken, effectiveYear),
      checkNumber: checkNum,
      description,
      credit,
      debit,
      amount,
      direction,
      endingDailyBalance: dailyBal,
      rawLine: row
    };
  }

  const checkMatch = rest.match(/^(\d{3,6})\s+Check\s+([\d,]+\.\d{2})(?:\s+([\d,]+\.\d{2}))?$/i);
  if (checkMatch) {
    const debitAmt = moneyToNumber(checkMatch[2]);
    return {
      postedDate: normalizeDate(postedToken, effectiveYear),
      checkNumber: checkMatch[1],
      description: 'Check',
      credit: null,
      debit: debitAmt,
      amount: debitAmt != null ? -debitAmt : null,
      direction: 'debit',
      endingDailyBalance: checkMatch[3] ? moneyToNumber(checkMatch[3]) : null,
      rawLine: row
    };
  }

  const nums = [...rest.matchAll(MONEY_TOKEN_RE)].map((m) => ({
    value: moneyToNumber(m[0]),
    index: m.index ?? 0
  }));

  if (nums.length === 0) {
    return {
      postedDate: normalizeDate(postedToken, effectiveYear),
      checkNumber: null,
      description: rest,
      credit: null,
      debit: null,
      amount: null,
      direction: null,
      endingDailyBalance: null,
      rawLine: row
    };
  }

  const txnAmountIndex = nums[0].index;
  const description = rest.slice(0, txnAmountIndex).trim();

  let { amountTokens, endingDailyBalance: rowDailyBalance } = stripWellsAmountTokens(nums);
  if (amountTokens.length >= 2) {
    const last = amountTokens[amountTokens.length - 1];
    const prev = amountTokens[amountTokens.length - 2];
    if (last.index - prev.index >= BALANCE_SEPARATION_MIN_GAP && amountTokens.length > 2) {
      rowDailyBalance = last.value;
      amountTokens = amountTokens.slice(0, -1);
    }
  }

  const { credit, debit, amount, direction } = assignWellsColumnAmounts(
    amountTokens,
    description,
    rest
  );

  return {
    postedDate: normalizeDate(postedToken, effectiveYear),
    checkNumber: null,
    description,
    credit,
    debit,
    amount,
    direction,
    endingDailyBalance: null,
    rawLine: row
  };
}

/**
 * Assign ending_daily_balance only on last txn of each postedDate block.
 * @param {Array<object>} parsedRows
 */
export function assignEndingDailyBalancesByDateBlock(parsedRows) {
  if (!parsedRows?.length) return parsedRows;

  const blocks = [];
  let currentDate = null;
  let block = [];

  for (const row of parsedRows) {
    if (row.postedDate !== currentDate) {
      if (block.length) blocks.push(block);
      block = [row];
      currentDate = row.postedDate;
    } else {
      block.push(row);
    }
  }
  if (block.length) blocks.push(block);

  for (const dateBlock of blocks) {
    for (const r of dateBlock) {
      r.endingDailyBalance = null;
    }
    const last = dateBlock[dateBlock.length - 1];
    const bal = extractTrailingDailyBalance(last.rawLine);
    if (bal != null) {
      last.endingDailyBalance = bal;
    }
  }

  return parsedRows;
}

function finalizeDailyBalances(transactions) {
  const byDate = new Map();
  for (const t of transactions) {
    if (!byDate.has(t.postedDate)) byDate.set(t.postedDate, []);
    byDate.get(t.postedDate).push(t);
  }
  for (const rows of byDate.values()) {
    let lastWithBal = null;
    for (const r of rows) {
      if (r.endingDailyBalance != null) lastWithBal = r;
    }
    for (const r of rows) {
      if (r !== lastWithBal) r.endingDailyBalance = null;
    }
  }
  return transactions;
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
        balance: t.endingDailyBalance,
        rawLine: t.rawLine,
        extractionSource: PROFILE_ID,
        checkNumber: t.checkNumber
      })
    );
}

/**
 * Raw extraction only — no checksum validation (Agent 1).
 * @param {{ text: string, defaultYear?: number, altText?: string, sectionChunks?: object }} ctx
 */
export function extractRaw({ text, defaultYear, altText, sectionChunks }) {
  const fullNormalized = normalizeSpaces(text);
  const workingNormalized = pickWellsExtractionText(fullNormalized, altText);
  const summary = extractSummary(fullNormalized) ?? extractSummary(workingNormalized);
  if (!summary) {
    throw new Error('Wells Initiate: could not extract activity summary');
  }

  const year = defaultYear ?? inferStatementYear(fullNormalized, summary.periodEndToken);
  const accountNumber = extractAccountNumber(fullNormalized);
  const section =
    sectionChunks?.transactionHistory?.trim().length > 0
      ? sectionChunks.transactionHistory
      : extractTransactionSection(workingNormalized);
  if (!section) {
    throw new Error('Wells Initiate: transaction history section not found');
  }

  const periodContext = {
    periodStartToken: summary.periodStartToken,
    periodEndToken: summary.periodEndToken
  };
  const rows = splitRows(section);
  let transactions = rows.map((r) => parseRow(r, year, periodContext)).filter(Boolean);
  transactions = assignEndingDailyBalancesByDateBlock(transactions);
  transactions = finalizeDailyBalances(transactions);

  const meta = {
    bankDisplayName: 'Wells Fargo',
    accountNumber,
    accountNumberLast4: accountNumber ? accountNumber.slice(-4) : null,
    statementPeriodStart: summary.periodStartToken,
    statementPeriodEnd: summary.periodEndToken,
    openingBalance: summary.openingBalance,
    printedDeposits: summary.printedDeposits,
    printedWithdrawals: summary.printedWithdrawals,
    closingBalance: summary.closingBalance,
    statementYear: year,
    extractionProfile: PROFILE_ID
  };

  const ledgerTransactions = mapToLedgerTransactions(transactions);

  return {
    meta,
    normalizedTransactions: transactions,
    transactions: ledgerTransactions,
    rows,
    sectionChunks: {
      summary: sectionChunks?.summary ?? fullNormalized.slice(0, 2000),
      transactionHistory: section,
      deposits: section,
      withdrawals: section
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
 * @param {{ text: string, defaultYear?: number }} ctx
 */
export function extract({ text, defaultYear, altText, sectionChunks }) {
  const raw = extractRaw({ text, defaultYear, altText, sectionChunks });
  const { meta, normalizedTransactions: transactions, transactions: ledgerTransactions, rows } =
    raw;

  const reconciliation = reconcileStatement(meta, ledgerTransactions);

  if (!reconciliation.checksumOk) {
    const partial = {
      meta,
      normalizedTransactions: transactions,
      transactions: ledgerTransactions,
      rows
    };
    logger.warn('[WELLS_INITIATE] checksum breakdown', {
      parsedDeposits: reconciliation.parsedDeposits,
      printedDeposits: reconciliation.printedDeposits,
      parsedWithdrawals: reconciliation.parsedWithdrawals,
      printedWithdrawals: reconciliation.printedWithdrawals,
      computedClosing: reconciliation.computedClosing,
      closing: reconciliation.closing,
      depositsMatch: reconciliation.depositsMatch,
      withdrawalsMatch: reconciliation.withdrawalsMatch,
      closingMatch: reconciliation.closingMatch,
      driftDeposits:
        reconciliation.parsedDeposits != null && reconciliation.printedDeposits != null
          ? Number((reconciliation.parsedDeposits - reconciliation.printedDeposits).toFixed(2))
          : null,
      driftWithdrawals:
        reconciliation.parsedWithdrawals != null && reconciliation.printedWithdrawals != null
          ? Number(
              (reconciliation.parsedWithdrawals - reconciliation.printedWithdrawals).toFixed(2)
            )
          : null,
      driftClosing:
        reconciliation.computedClosing != null && reconciliation.closing != null
          ? Number((reconciliation.computedClosing - reconciliation.closing).toFixed(2))
          : null,
      txnCount: ledgerTransactions.length
    });
    throw new WellsParseReconciliationError(reconciliation, partial);
  }

  logger.info('[WELLS_INITIATE] extracted', {
    rowCount: rows.length,
    txnCount: ledgerTransactions.length,
    printedDeposits: meta.printedDeposits,
    opening: meta.openingBalance,
    closing: meta.closingBalance,
    checksumOk: true
  });

  return {
    meta,
    normalizedTransactions: transactions,
    transactions: ledgerTransactions,
    reconciliation,
    accepted: true,
    stitcherPrinted: raw.stitcherPrinted
  };
}

export default {
  PROFILE_ID,
  WellsParseReconciliationError,
  detect,
  extractRaw,
  extract,
  isDateGroupRowStart,
  classifyWellsDescription,
  assignEndingDailyBalancesByDateBlock,
  pickWellsExtractionText,
  extractSummary,
  extractTransactionSection,
  parseRow,
  resolvePostedYear,
  assignWellsColumnAmounts,
  inferDirectionFromAmountPosition,
  extractTrailingDailyBalance,
  stripWellsAmountTokens,
  tryRecoverWellsNearMiss
};
