/**
 * rescueAcceptanceGate.js
 *
 * Programmatic acceptance gates for AI rescue repair candidates.
 * AI is a repair candidate generator — never the final authority.
 * Every candidate must pass generic gates plus mode-specific validators
 * before acceptance.
 *
 * Trust tiers:
 *   'none'                — evidence not grounded in page words
 *   'grounded'            — evidence bboxes exist in page (or no pageWords provided)
 *   'grounded_plus_local' — grounded + date/amount/section consistent with neighbors
 */

const RESCUE_SCHEMAS = {
  ROW_MERGE: ['decision', 'confidence', 'reason', 'evidence'],
  COLUMN_REMAP: ['decision', 'confidence', 'reason', 'evidence'],
  DROP_REVIEW: ['decision', 'confidence', 'reason', 'evidence'],
  RAW_LEDGER: ['decision', 'confidence', 'reason', 'evidence'],
  // Phase-2 stubs (disabled): reserved so future modes keep the same gate surface
  SECTION_TAG: ['decision', 'confidence', 'reason', 'evidence'],
  BALANCE_FILL: ['decision', 'confidence', 'reason', 'evidence'],
};

// ---------------------------------------------------------------------------
// Generic gates
// ---------------------------------------------------------------------------

export function validateSchema(candidate, mode) {
  const required = RESCUE_SCHEMAS[mode];
  if (!required) return false;
  return required.every((field) => field in candidate);
}

export function validateGrounding(candidate, pageWords) {
  if (!candidate.evidence || !Array.isArray(candidate.evidence) || candidate.evidence.length === 0) {
    return false;
  }

  // When pageWords are not supplied (common first cut), accept structural evidence only.
  // Full bbox grounding activates once pageWords are plumbed through.
  if (!Array.isArray(pageWords) || pageWords.length === 0) {
    return candidate.evidence.every((ev) => ev && typeof ev.text === 'string' && ev.text.length > 0);
  }

  return candidate.evidence.every((ev) => {
    if (!ev?.text || !ev?.bbox) return false;
    const match = pageWords.find(
      (w) =>
        w.text === ev.text &&
        Math.abs(w.x0 - ev.bbox[0]) < 3 &&
        Math.abs(w.top - ev.bbox[1]) < 3
    );
    return !!match;
  });
}

function isDuplicate(candidate, existingTxns) {
  const proposed = candidate.proposed_transaction;
  if (!proposed) return false;
  return (existingTxns || []).some((t) => {
    if (proposed.rowFingerprint && t.rowFingerprint === proposed.rowFingerprint) return true;
    const tDate = t.txn_date || t.date;
    const tAmt = t.amount_cents != null ? t.amount_cents : Math.round((t.amount || 0) * 100);
    const tDesc = t.description_raw || t.description || '';
    return (
      tDate === proposed.txn_date &&
      tAmt === proposed.amount_cents &&
      tDesc === (proposed.description_raw || '')
    );
  });
}

function isValidDate(dateStr) {
  if (!dateStr || typeof dateStr !== 'string') return false;
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    const d = new Date(dateStr);
    return !Number.isNaN(d.getTime());
  }
  const m = dateStr.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/);
  if (!m) return false;
  const month = Number(m[1]);
  const day = Number(m[2]);
  return month >= 1 && month <= 12 && day >= 1 && day <= 31;
}

function resolveAmountCents(candidate) {
  const pt = candidate.proposed_transaction;
  if (pt?.amount_cents != null) return Math.abs(Number(pt.amount_cents) || 0);
  if (candidate.proposed_amount != null) {
    const n = Number(candidate.proposed_amount);
    // Accept either dollars or already-cents heuristics for COLUMN_REMAP.
    return Math.abs(n) >= 1000 && Number.isInteger(n) ? Math.abs(n) : Math.round(Math.abs(n) * 100);
  }
  return 0;
}

/**
 * Generic gate suite. Decision-aware:
 * - discard/keep/pass/merge_with_previous only need schema + grounding
 * - promote_to_transaction requires date/amount/duplicate checks
 * - reassign requires amount/column (via mode-specific too)
 */
export function validateRepair(candidate, mode, context = {}) {
  const decision = String(candidate.decision || '').toLowerCase();
  const isNoOp = ['discard', 'keep', 'pass'].includes(decision);
  const isPromote = decision === 'promote_to_transaction';
  const isMerge = decision === 'merge_with_previous';
  const isReassign = decision === 'reassign';

  const gates = [
    { name: 'schema', fn: () => validateSchema(candidate, mode) },
    { name: 'grounding', fn: () => validateGrounding(candidate, context.pageWords || []) },
  ];

  if (isPromote || isMerge) {
    gates.push(
      { name: 'duplicate', fn: () => !isDuplicate(candidate, context.existingTxns || []) },
      {
        name: 'date',
        fn: () =>
          isValidDate(candidate.proposed_transaction?.txn_date) ||
          (isMerge && !!candidate.parent_row_id),
      },
      { name: 'amount', fn: () => resolveAmountCents(candidate) > 0 || isMerge },
    );
  } else if (isReassign) {
    gates.push({ name: 'amount', fn: () => resolveAmountCents(candidate) > 0 });
  } else if (!isNoOp) {
    // Unknown decision — require hard promotion shape
    gates.push(
      { name: 'duplicate', fn: () => !isDuplicate(candidate, context.existingTxns || []) },
      { name: 'date', fn: () => isValidDate(candidate.proposed_transaction?.txn_date) },
      { name: 'amount', fn: () => resolveAmountCents(candidate) > 0 },
    );
  }

  const results = {};
  let allPassed = true;
  for (const gate of gates) {
    results[gate.name] = gate.fn();
    if (!results[gate.name]) allPassed = false;
  }
  return { passed: allPassed, results };
}

// ---------------------------------------------------------------------------
// Mode-specific validators
// ---------------------------------------------------------------------------

function validateRowMerge(repair) {
  const decision = String(repair.decision || '').toLowerCase();
  if (['discard', 'pass', 'keep'].includes(decision)) return true;
  if (decision === 'merge_with_previous') {
    return repair.parent_row_id != null || !!repair.proposed_transaction?.txn_date;
  }
  if (decision === 'promote_to_transaction') {
    if (!repair.proposed_transaction?.txn_date) return false;
    if (resolveAmountCents(repair) <= 0) return false;
    return true;
  }
  return false;
}

function validateColumnRemap(repair) {
  const decision = String(repair.decision || '').toLowerCase();
  if (['keep', 'pass', 'discard'].includes(decision)) return true;
  if (decision !== 'reassign') return false;
  if (repair.proposed_column == null) return false;
  if (repair.flips_amount && repair.flips_balance) return false;
  if (resolveAmountCents(repair) <= 0) return false;
  return true;
}

function validateDropReview(repair, context) {
  const decision = String(repair.decision || '').toLowerCase();
  if (['discard', 'pass', 'keep', 'merge_with_previous'].includes(decision)) return true;
  if (decision !== 'promote_to_transaction') return false;
  const desc = (repair.proposed_transaction?.description_raw || '').toLowerCase();
  if (/^(?:totals?|summary|subtotal)\b/.test(desc)) return false;
  if (/\b(?:beginning|opening|ending|closing)\s+balance\b/.test(desc)) return false;
  if (!repair.proposed_transaction?.txn_date) return false;
  if (resolveAmountCents(repair) <= 0) return false;

  // Reference-only descriptions cannot be promoted even with date+amount:
  // they are summary-page echoes / card suffixes / routing artifacts.
  // A real check promotion must carry payee/description context or match
  // the printed Summary of checks written cross-check.
  const rawDesc = String(repair.proposed_transaction?.description_raw || '').trim();
  if (/^\d{3,5}\s*\*?$/.test(rawDesc)) return false; // bare check number
  if (/^\d{4}$/.test(rawDesc)) return false; // card suffix
  if (/\b\d{9,}\b/.test(rawDesc)) return false; // routing bleed
  if (!/^[\d\s.,\-$/]+$/.test(rawDesc) && rawDesc.length < 3) return false;

  // Duplicate-of-ledger guard: same date + amount already parsed (summary echo)
  if (context.existingTxns?.length) {
    const amount = resolveAmountCents(repair) / 100;
    const dup = context.existingTxns.some((t) => {
      const tAmt = Math.abs(Number(t.amount) || 0);
      const tDate = t.date || t.txn_date;
      return Math.abs(tAmt - amount) < 0.005 && tDate === repair.proposed_transaction.txn_date;
    });
    if (dup) return false;
  }
  return true;
}

function validateRawLedger(repair) {
  const decision = String(repair.decision || '').toLowerCase();
  if (['pass', 'discard', 'keep'].includes(decision)) return true;
  if (decision !== 'promote_to_transaction') return false;

  // RAW_LEDGER reconstructs a ledger from raw word lines: every promoted row
  // must carry bbox-grounded evidence (no free-text reconstruction).
  if (!Array.isArray(repair.evidence) || repair.evidence.length === 0) return false;
  if (!repair.evidence.every((ev) => Array.isArray(ev?.bbox) && ev.bbox.length === 4)) {
    return false;
  }

  const desc = String(repair.proposed_transaction?.description_raw || '').trim();
  if (desc.length < 3) return false;
  if (/^(?:totals?|summary|subtotal)\b/.test(desc.toLowerCase())) return false;
  if (/\b(?:beginning|opening|ending|closing)\s+balance\b/i.test(desc)) return false;
  if (/\b\d{9,}\b/.test(desc)) return false; // routing bleed
  if (!repair.proposed_transaction?.txn_date) return false;
  if (resolveAmountCents(repair) <= 0) return false;

  // Running-balance guard: a promoted row must not be a bare number.
  if (/^[\d,]+\.\d{2}$/.test(desc)) return false;
  return true;
}

// Phase-2 stub validators — disabled; always reject so modes cannot auto-fire.
function validateSectionTagStub() {
  return false;
}
function validateBalanceFillStub() {
  return false;
}

const MODE_VALIDATORS = {
  ROW_MERGE: validateRowMerge,
  COLUMN_REMAP: validateColumnRemap,
  DROP_REVIEW: validateDropReview,
  RAW_LEDGER: validateRawLedger,
  SECTION_TAG: validateSectionTagStub,
  BALANCE_FILL: validateBalanceFillStub,
};

export function validateModeSpecific(repair, mode, context = {}) {
  const validator = MODE_VALIDATORS[mode];
  if (!validator) return { passed: true, results: { mode_specific: true } };
  const passed = !!validator(repair, context);
  return { passed, results: { mode_specific: passed } };
}

// ---------------------------------------------------------------------------
// Trust tiers
// ---------------------------------------------------------------------------

function isDatePlausible(repair, context) {
  const dateStr = repair.proposed_transaction?.txn_date;
  const decision = String(repair.decision || '').toLowerCase();
  if (['discard', 'keep', 'pass', 'merge_with_previous', 'reassign'].includes(decision)) {
    return true;
  }
  if (!isValidDate(dateStr)) return false;
  const { statementPeriod } = context;
  if (statementPeriod?.start && statementPeriod?.end) {
    const d = new Date(dateStr);
    if (!Number.isNaN(d.getTime())) {
      return d >= new Date(statementPeriod.start) && d <= new Date(statementPeriod.end);
    }
  }
  return true;
}

function isAmountPlausible(repair) {
  const decision = String(repair.decision || '').toLowerCase();
  if (['discard', 'keep', 'pass', 'merge_with_previous'].includes(decision)) return true;
  const amount = resolveAmountCents(repair);
  if (amount <= 0) return false;
  if (amount > 25_000_000) return false; // $250K
  return true;
}

function isSectionConsistent(repair, context) {
  const section = repair.proposed_transaction?.section;
  if (!section) return true;
  const neighbors = context.neighborRows || [];
  if (neighbors.length === 0) return true;
  return neighbors.some((n) => n.section === section || n.sectionId === section);
}

export function assignTrustTier(repair, mode, context) {
  if (!validateGrounding(repair, context.pageWords || [])) return 'none';

  const locallyPlausible =
    isDatePlausible(repair, context) &&
    isAmountPlausible(repair) &&
    isSectionConsistent(repair, context);
  if (!locallyPlausible) return 'grounded';

  // Statement-improving is assigned by the pipeline after candidate reconciliation.
  return 'grounded_plus_local';
}

export function shouldAutoAccept(tier, confidence) {
  if (tier === 'none') return false;
  if (Number(confidence) >= 0.9) return true;
  return false;
}

export default {
  validateSchema,
  validateGrounding,
  validateRepair,
  validateModeSpecific,
  assignTrustTier,
  shouldAutoAccept,
};
