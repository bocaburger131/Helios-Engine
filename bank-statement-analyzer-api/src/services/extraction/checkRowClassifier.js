/**
 * checkRowClassifier.js — deterministic triage for check-number-shaped dropped
 * rows, run BEFORE DROP_REVIEW so the AI never sees summary echoes.
 *
 * Wells Fargo statements carry a "Summary of checks written" section whose
 * rows look like transactions (number + date + amount) but are echoes of
 * checks already displayed in the transaction history. Promoting them would
 * double-count the ledger. This classifier separates:
 *
 *   CHECK_ROW          real check transaction NOT yet in the ledger (promote candidate)
 *   CHECK_SUMMARY_REF  echo of a check already parsed (never promote)
 *   CHECK_ARTIFACT     reference/card-suffix/routing-shaped junk (never promote)
 */

const CHECK_NUMBER_RE = /^(\d{3,5})(\s*\*)?$/;
const CARD_SUFFIX_RE = /^\d{4}$/;
const ROUTING_BLEED_RE = /\b\d{9,}\b/;

/**
 * Parse the "Summary of checks written" table from statement text.
 * Format: header "Number Date Amount" repeated 3x, then rows of triplets.
 * @param {string} fullText
 * @returns {Map<string, {number: string, date: string, amount: number}>} keyed by check number
 */
export function parseCheckSummary(fullText) {
  const out = new Map();
  const text = String(fullText || '');
  const start = text.search(/Summary\s+of\s+checks\s+written/i);
  if (start < 0) return out;

  // Take the section after the header line; stop at the next page marker
  const section = text.slice(start);
  const lines = section.split('\n');

  for (const line of lines) {
    if (/Page\s+\d+\s+of/i.test(line) && /December|January|February|March/i.test(line)) {
      break;
    }
    if (/^Account transaction fees|IMPORTANT ACCOUNT/i.test(line)) break;
    if (/Summary\s+of\s+checks\s+written/i.test(line)) continue;
    if (/Number\s+Date\s+Amount/i.test(line)) continue;

    const tokens = line.trim().split(/\s+/);
    if (tokens.length < 3) continue;

    // Rows are triplets (number, M/D date, amount) — usually 3 per line
    for (let i = 0; i + 2 < tokens.length; i += 3) {
      const num = tokens[i].replace(/\*/g, '');
      const date = tokens[i + 1];
      const amt = parseAmount(tokens[i + 2]);
      if (CHECK_NUMBER_RE.test(num) && /^\d{1,2}\/\d{1,2}/.test(date) && amt != null) {
        out.set(num, { number: num, date, amount: amt });
      }
    }
  }
  return out;
}

function parseAmount(raw) {
  const n = Number(String(raw || '').replace(/[,$\s]/g, ''));
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Normalize a parsed transaction date (ISO or M/D) to M/D form for comparison. */
function toMD(dateStr) {
  const s = String(dateStr || '').trim();
  const m = s.match(/^(\d{1,2})\/(\d{1,2})/);
  if (m) return `${Number(m[1])}/${Number(m[2])}`;
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${Number(iso[2])}/${Number(iso[3])}`;
  return s;
}

/**
 * Classify one dropped row by its check shape and ledger context.
 * @param {object} dr — dropped row from parser evidence
 * @param {object} context — { existingTxns: object[], checkSummary: Map }
 * @returns {{ kind: string, reason: string, matchedTxn?: object }}
 */
export function classifyDroppedCheckRow(dr, context = {}) {
  const desc = String(dr.description || '').trim();
  const amount = Math.abs(Number(dr.amount) || 0);
  const date = toMD(dr.date || dr.nearest_date || '');
  const existingTxns = Array.isArray(context.existingTxns) ? context.existingTxns : [];
  const summary = context.checkSummary instanceof Map ? context.checkSummary : new Map();

  // Not check-number shaped at all → not this classifier's job
  if (!CHECK_NUMBER_RE.test(desc)) {
    return { kind: 'NOT_CHECK', reason: 'description is not check-number shaped' };
  }

  const checkNum = desc.replace(/\*/g, '');
  const summaryEntry = summary.get(checkNum) || null;

  // Routing artifacts never promote
  if (ROUTING_BLEED_RE.test(desc)) {
    return {
      kind: 'CHECK_ARTIFACT',
      reason: `routing/reference artifact (${desc})`,
      summaryEntry,
    };
  }

  // Echo of an already-parsed check: same date + amount in the ledger.
  // The transaction-history copy is the real transaction; the summary row is
  // the echo. Promoting the echo would double-count. This check runs BEFORE
  // the printed-summary match so ledger copies never become CHECK_ROW.
  const dup = existingTxns.find((t) => {
    const tAmt = Math.abs(Number(t.amount) || 0);
    return tAmt === amount && toMD(t.date || t.txn_date) === date;
  });
  if (dup) {
    return {
      kind: 'CHECK_SUMMARY_REF',
      reason: `already parsed as txn (${date} $${amount.toFixed(2)}) — promoting would double-count`,
      matchedTxn: dup,
      summaryEntry,
    };
  }

  // Check-summary membership wins over the 4-digit card-suffix heuristic:
  // 4-digit check numbers (2351, 2374…) look like card suffixes but are real
  // checks when they appear in the printed Summary of checks written.
  if (summaryEntry) {
    const sAmt = Math.abs(summaryEntry.amount || 0);
    const sDate = toMD(summaryEntry.date);
    if (Math.abs(sAmt - amount) < 0.005 && sDate === date) {
      return {
        kind: 'CHECK_ROW',
        reason: `check ${checkNum} on ${date} $${amount.toFixed(2)} matches printed summary and is missing from ledger`,
        summaryEntry,
      };
    }
    return {
      kind: 'CHECK_ARTIFACT',
      reason: `check ${checkNum} in summary but date/amount mismatch (${sDate} $${sAmt.toFixed(2)} vs ${date} $${amount.toFixed(2)})`,
      summaryEntry,
    };
  }

  // Card suffix / reference-only: not in the printed check summary
  if (CARD_SUFFIX_RE.test(desc)) {
    return {
      kind: 'CHECK_ARTIFACT',
      reason: `card-suffix/reference artifact (${desc})`,
      summaryEntry,
    };
  }

  // Check-shaped but no summary hit and no ledger dup: not trustworthy alone
  return {
    kind: 'CHECK_ARTIFACT',
    reason: `check-shaped (${desc}) with no printed-summary match and no ledger duplicate`,
  };
}

/**
 * Triage a batch of dropped rows. Returns per-row classification plus the
 * subset that may proceed to DROP_REVIEW (CHECK_ROW only).
 * @param {object[]} droppedRows
 * @param {object} context — { existingTxns, checkSummary }
 */
export function triageDroppedCheckRows(droppedRows, context = {}) {
  const results = [];
  const promotable = [];
  for (const dr of droppedRows || []) {
    const c = classifyDroppedCheckRow(dr, context);
    results.push({ droppedRow: dr, ...c });
    if (c.kind === 'CHECK_ROW') promotable.push(dr);
  }
  return { results, promotable, summary: countKinds(results) };
}

function countKinds(results) {
  const counts = { CHECK_ROW: 0, CHECK_SUMMARY_REF: 0, CHECK_ARTIFACT: 0, NOT_CHECK: 0 };
  for (const r of results) counts[r.kind] = (counts[r.kind] || 0) + 1;
  return counts;
}

export default {
  parseCheckSummary,
  classifyDroppedCheckRow,
  triageDroppedCheckRows,
};
