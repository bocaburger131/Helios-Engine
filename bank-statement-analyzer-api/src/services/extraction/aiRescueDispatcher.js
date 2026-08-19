/**
 * AI Rescue Dispatcher — classifies parser evidence (dropped rows, uncertain
 * column assignments) into bounded rescue modes, routes them to the AI via
 * aiOrchestratorService.runRescue, parses structured repair candidates, and
 * validates each through the acceptance gates.
 *
 * Design rule: AI produces repair CANDIDATES only. The pipeline overlays them
 * on the base ledger and reconciles both — the parser output is never mutated
 * in place.
 *
 * Active modes: ROW_MERGE, COLUMN_REMAP, DROP_REVIEW, RAW_LEDGER
 * Disabled stubs: SECTION_TAG, BALANCE_FILL (enum present, never populated)
 */
import logger from '../../utils/logger.js';
import {
  validateRepair,
  validateModeSpecific,
  assignTrustTier,
  shouldAutoAccept,
} from './rescueAcceptanceGate.js';
import { triageDroppedCheckRows, parseCheckSummary } from './checkRowClassifier.js';

export const RESCUE_MODES = {
  ROW_MERGE: 'ROW_MERGE',
  COLUMN_REMAP: 'COLUMN_REMAP',
  DROP_REVIEW: 'DROP_REVIEW',
  RAW_LEDGER: 'RAW_LEDGER', // zero-ledger last resort — bounded full reconstruction
  SECTION_TAG: 'SECTION_TAG', // Phase-2 stub — disabled
  BALANCE_FILL: 'BALANCE_FILL', // Phase-2 stub — disabled
};

/** Modes that are allowed to send evidence to AI. Stubs stay out of this set. */
export const ACTIVE_RESCUE_MODES = new Set([
  RESCUE_MODES.ROW_MERGE,
  RESCUE_MODES.COLUMN_REMAP,
  RESCUE_MODES.DROP_REVIEW,
  RESCUE_MODES.RAW_LEDGER,
]);

const RESCUE_BATCH_SIZE = 10;

/**
 * RAW_LEDGER line cap. The raw word inventory of an unknown layout can be
 * thousands of lines; the rescue prompt must stay inside the model's output
 * budget, so lines are evenly sampled down to this cap before dispatch.
 */
export const RAW_LEDGER_LINE_CAP = 600;

/** Bump when any prompt template changes — invalidates rescue cache entries. */
export const RESCUE_PROMPT_VERSION = 'section-deltas-v2';

/**
 * Evenly sample raw word rows down to cap, preserving document coverage.
 */
function capRawWordRows(rows, cap) {
  if (!Array.isArray(rows) || rows.length === 0) return [];
  if (rows.length <= cap) return rows;
  const out = [];
  const step = rows.length / cap;
  for (let i = 0; i < cap; i += 1) {
    out.push(rows[Math.min(rows.length - 1, Math.floor(i * step))]);
  }
  return out;
}

const MONEY_TOKEN_RE = /\$?\s*\d{1,3}(?:,\d{3})*\.\d{2}/;

/**
 * Guard: only fire RAW_LEDGER when the raw lines actually contain a money
 * token larger than $0.01. An empty statement (no rows, no amounts) must not
 * spend an AI call to reconstruct a ledger that does not exist.
 */
function rawRowsContainMoney(rows) {
  if (!Array.isArray(rows)) return false;
  for (const row of rows) {
    const text = String(row?.line_text || '');
    const m = text.match(MONEY_TOKEN_RE);
    if (!m) continue;
    const value = Number.parseFloat(m[0].replace(/[$,]/g, ''));
    if (Number.isFinite(value) && value > 0.01) return true;
  }
  return false;
}

/**
 * Classify evidence into rescue-mode batches.
 * SECTION_TAG / BALANCE_FILL are present in the return object as empty arrays
 * so the contract is future-proof, but they are never populated.
 * @param {object} evidence — { droppedRows, uncertainAssignments, transactions, pageTelemetry }
 * @returns {{ modeCounts: object, batches: object }}
 */
export function classifyRescueItems(evidence) {
  const batches = {
    [RESCUE_MODES.ROW_MERGE]: [],
    [RESCUE_MODES.COLUMN_REMAP]: [],
    [RESCUE_MODES.DROP_REVIEW]: [],
    [RESCUE_MODES.RAW_LEDGER]: [],
    [RESCUE_MODES.SECTION_TAG]: [], // disabled stub
    [RESCUE_MODES.BALANCE_FILL]: [], // disabled stub
  };

  // ROW_MERGE: dropped rows with money tokens + no date / empty desc (continuation candidates)
  for (const dr of evidence.droppedRows || []) {
    if (dr.drop_reason === 'no_date' || dr.drop_reason === 'empty_description') {
      if (dr.amount != null && dr.amount !== 0) {
        batches[RESCUE_MODES.ROW_MERGE].push(dr);
      }
    }
  }

  // COLUMN_REMAP: uncertain assignments at column boundaries
  for (const ua of evidence.uncertainAssignments || []) {
    if (ua.reason === 'column_boundary' || ua.reason === 'amount_balance_ambiguity') {
      batches[RESCUE_MODES.COLUMN_REMAP].push(ua);
    }
  }

  // DROP_REVIEW: all other dropped rows with money — after deterministic
  // check-row triage. Summary-of-checks echoes and reference artifacts are
  // classified BEFORE the AI sees them (they would double-count the ledger).
  const checkContext = {
    existingTxns: evidence.transactions || [],
    checkSummary: evidence.checkSummary || parseCheckSummary(evidence.fullText || ''),
  };
  const triage = triageDroppedCheckRows(
    (evidence.droppedRows || []).filter(
      (dr) =>
        dr.amount != null &&
        dr.amount !== 0 &&
        dr.drop_reason !== 'no_date' &&
        dr.drop_reason !== 'empty_description'
    ),
    checkContext
  );
  if (triage.summary && Object.values(triage.summary).some((c) => c > 0)) {
    logger.info('[RESCUE] check-row triage', triage.summary);
  }
  batches[RESCUE_MODES.DROP_REVIEW].push(...triage.promotable);

  // RAW_LEDGER: zero-ledger last resort. Fires ONLY when every deterministic
  // engine returned no transactions AND no surgical evidence (dropped rows /
  // uncertain assignments) exists to act on. The batch is the capped raw word
  // line inventory — one bounded AI call per unknown layout.
  if (
    !(evidence.transactions || []).length &&
    !(evidence.droppedRows || []).length &&
    !(evidence.uncertainAssignments || []).length &&
    Array.isArray(evidence.rawWordRows) &&
    evidence.rawWordRows.length &&
    rawRowsContainMoney(evidence.rawWordRows)
  ) {
    batches[RESCUE_MODES.RAW_LEDGER] = capRawWordRows(
      evidence.rawWordRows,
      RAW_LEDGER_LINE_CAP
    );
  }

  // SECTION_TAG / BALANCE_FILL intentionally left empty — Phase 2.

  const modeCounts = {};
  for (const [mode, items] of Object.entries(batches)) {
    modeCounts[mode] = items.length;
  }

  return { modeCounts, batches, checkTriage: triage.summary };
}

function getSchemaJson(mode) {
  const baseFields = {
    decision: 'string — mode-specific decision',
    confidence: 'number 0..1',
    reason: 'string — short justification',
    evidence: 'array of { text, bbox: [x0, top, x1, bottom] }',
  };
  switch (mode) {
    case RESCUE_MODES.ROW_MERGE:
    case RESCUE_MODES.DROP_REVIEW:
      return {
        ...baseFields,
        proposed_transaction: '{ txn_date, description_raw, amount_cents, rowFingerprint? }',
        parent_row_id: 'integer|null — for merge_with_previous',
      };
    case RESCUE_MODES.COLUMN_REMAP:
      return {
        ...baseFields,
        proposed_column: 'integer',
        proposed_amount: 'number (dollars)',
        parent_row_fingerprint: 'string|null',
      };
    case RESCUE_MODES.RAW_LEDGER:
      return {
        ...baseFields,
        proposed_transaction: '{ txn_date (YYYY-MM-DD), description_raw, amount_cents (SIGNED: negative = withdrawal/debit, positive = deposit/credit), section? (string — section heading this row belongs to), balance? }',
      };
    case RESCUE_MODES.SECTION_TAG:
    case RESCUE_MODES.BALANCE_FILL:
      return { ...baseFields, note: 'DISABLED_PHASE2_STUB' };
    default:
      return baseFields;
  }
}

/**
 * Build a narrow, evidence-grounded prompt for one rescue mode batch.
 * Phase-2 stubs return null so dispatch never sends them.
 * @param {string} mode
 * @param {object[]} batch
 * @param {object} [context] — { statementVitals: { printedDeposits, printedWithdrawals, parsedDeposits, parsedWithdrawals } }
 */
export function buildRescuePrompt(mode, batch, context = {}) {
  if (!ACTIVE_RESCUE_MODES.has(mode)) {
    return null;
  }

  const vitals = context.statementVitals || {};

  const base = {
    instruction: '',
    schema: getSchemaJson(mode),
    rows: batch,
    context: {
      previous_row: 'included when available in each row.parent context',
      next_row: 'included when available in each row.next context',
      column_ranges: 'included on each uncertain assignment',
      section_heading: 'included when available on dropped rows',
      statement_vitals: {
        printed_deposits: vitals.printedDeposits ?? null,
        printed_withdrawals: vitals.printedWithdrawals ?? null,
        parsed_deposits: vitals.parsedDeposits ?? null,
        parsed_withdrawals: vitals.parsedWithdrawals ?? null,
        section_deltas: Array.isArray(vitals.sectionDeltas) ? vitals.sectionDeltas : [],
        balance_coverage_pct: vitals.balanceCoverage ?? null,
        txn_count: vitals.txnCount ?? null,
      },
    },
    rules: [
      'Use ONLY the supplied rows and bounding boxes.',
      'Cite evidence by bbox — do not invent amounts.',
      'If uncertain, set decision to "pass" and confidence to 0.',
      'Return valid JSON matching the schema exactly — a JSON array of decisions.',
      'Keep reasons to ONE short sentence. Do not restate the prompt or the totals.',
      'Do NOT truncate the array — every row needs a decision. Use "pass" for the last rows if output budget is tight.',
    ],
  };

  switch (mode) {
    case RESCUE_MODES.ROW_MERGE:
      base.instruction = `You are reviewing dropped rows that may be continuation fragments of the preceding transaction.

For each dropped row:
- If it has no date AND contains continuation text or a money token that matches the preceding row's amount, decide "merge_with_previous".
- If it looks like a standalone transaction that was incorrectly dropped, decide "promote_to_transaction".
- Otherwise, decide "discard".

Return a JSON array of decisions with evidence bounding boxes.`;
      break;

    case RESCUE_MODES.COLUMN_REMAP: {
      const depImbalance =
        vitals.printedDeposits != null && vitals.parsedDeposits != null
          ? vitals.printedDeposits - vitals.parsedDeposits
          : null;
      const wdImbalance =
        vitals.printedWithdrawals != null && vitals.parsedWithdrawals != null
          ? vitals.printedWithdrawals - vitals.parsedWithdrawals
          : null;
      const vitalsLine = [
        'Statement printed totals (ground truth):',
        `  Printed deposits:    ${vitals.printedDeposits != null ? `$${Number(vitals.printedDeposits).toLocaleString(undefined, { minimumFractionDigits: 2 })}` : 'unknown'}`,
        `  Printed withdrawals: ${vitals.printedWithdrawals != null ? `$${Number(vitals.printedWithdrawals).toLocaleString(undefined, { minimumFractionDigits: 2 })}` : 'unknown'}`,
        'Current parsed totals (base ledger):',
        `  Parsed deposits:    ${vitals.parsedDeposits != null ? `$${Number(vitals.parsedDeposits).toLocaleString(undefined, { minimumFractionDigits: 2 })}` : 'unknown'}`,
        `  Parsed withdrawals: ${vitals.parsedWithdrawals != null ? `$${Number(vitals.parsedWithdrawals).toLocaleString(undefined, { minimumFractionDigits: 2 })}` : 'unknown'}`,
      ].join('\n');
      const imbalanceLine =
        depImbalance != null || wdImbalance != null
          ? `\nImbalance to close (printed − parsed): deposits ${depImbalance != null ? `$${Number(depImbalance).toLocaleString(undefined, { minimumFractionDigits: 2 })}` : 'unknown'}, withdrawals ${wdImbalance != null ? `$${Number(wdImbalance).toLocaleString(undefined, { minimumFractionDigits: 2 })}` : 'unknown'}.`
          : '';

      const sectionLine = Array.isArray(vitals.sectionDeltas) && vitals.sectionDeltas.length
        ? '\nParsed totals by section (net = credits − debits):\n' +
          vitals.sectionDeltas
            .map(
              (s) =>
                `  ${s.section}: n=${s.count} credits=$${Number(s.credits).toLocaleString(undefined, { minimumFractionDigits: 2 })} debits=$${Number(s.debits).toLocaleString(undefined, { minimumFractionDigits: 2 })} net=$${Number(s.net).toLocaleString(undefined, { minimumFractionDigits: 2 })}`
            )
            .join('\n')
        : '';

      const coverageLine =
        vitals.balanceCoverage != null
          ? `\nBalance coverage: ${vitals.balanceCoverage}% of ${vitals.txnCount ?? '?'} transactions carry a running balance. A sparse balance column means balance values are easily mistaken for withdrawal amounts — only treat a token as a transaction amount if the row has a description; a bare number next to the balance column is likely a balance, not a withdrawal.`
          : '';

      base.instruction = `You are a targeted repair assistant. Money tokens near column boundaries may be assigned to the wrong column, and mis-assignments are a primary cause of the statement checksum gap.

${vitalsLine}${imbalanceLine}${sectionLine}${coverageLine}

For each uncertain assignment, use the printed totals as the ground truth:

1. Compare the row's current assignment against the statement's printed deposit/withdrawal imbalance.
2. Reassign ONLY when moving the token to the alternative column reduces that imbalance (deposits column → CREDIT adds to parsed deposits; withdrawals column → DEBIT adds to parsed withdrawals).
3. If a token sits near a boundary, choose the side that improves the statement-level delta — not the side that merely looks locally tidy.
4. Do NOT keep a bad assignment just because it is locally plausible (well-aligned neighbors, plausible sign). The printed totals decide.
5. Balance-column caution: a token that looks like a large bare number with no description on its row is probably a running balance, not a transaction amount. Do NOT reassign balance values into withdrawals.
6. Return "keep" ONLY when neither assignment improves the printed-total delta or balance continuity.

Decide "reassign" or "keep" for each token. When reassigning, give the proposed column index and the proposed amount (positive dollars for deposits/credits, negative dollars for withdrawals/debits).`;
      break;
    }

    case RESCUE_MODES.DROP_REVIEW:
      base.instruction = `You are reviewing rows that were rejected by the parser.

For each dropped row:
- If it contains a date + description + valid money amount, decide "promote_to_transaction".
- If it's a summary line, header, or artifact, decide "discard".
- If it's a continuation fragment, decide "merge_with_previous".

Return a JSON array with proposed transactions where applicable.`;
      break;

    case RESCUE_MODES.RAW_LEDGER: {
      const vitalsLine = [
        'Statement printed totals (ground truth, may be unknown):',
        `  Printed deposits:    ${vitals.printedDeposits != null ? `$${Number(vitals.printedDeposits).toLocaleString(undefined, { minimumFractionDigits: 2 })}` : 'unknown'}`,
        `  Printed withdrawals: ${vitals.printedWithdrawals != null ? `$${Number(vitals.printedWithdrawals).toLocaleString(undefined, { minimumFractionDigits: 2 })}` : 'unknown'}`,
      ].join('\n');

      base.instruction = `You are reconstructing the transaction ledger of a bank statement whose layout was not recognized. Every word on the page is supplied as visual lines with bounding boxes. The deterministic engines produced ZERO transactions from this layout.

${vitalsLine}

For each line that contains a transaction row (a date, a description, and a money amount):
- Decide "promote_to_transaction" and output proposed_transaction.
- amount_cents is SIGNED: negative for withdrawals/debits, positive for deposits/credits.
- Cite evidence bounding boxes from that line's words. Every token you use must exist in the supplied lines.
- If the description spans multiple lines, include the continuation text in description_raw.
- A lone number at the right of a row with no description is a running balance, NOT a transaction amount. Do not promote it.
- A line that is a header, page footer, account summary, opening/closing balance, or artifact: decide "pass".
- Respect existing column hints (explicit vertical lines, detected money columns, section headers). Do NOT reshuffle columns unless the line is clearly misaligned.
- Preserve section boundaries. Never mix transactions between sections (e.g. "Operating account", "Loan", "Credit card") — assign each promoted row to the section it falls under.
- Use ISO dates (YYYY-MM-DD) for txn_date and 2-decimal precision for money.
- Do NOT "fix" totals or balances by guessing. If a line does not reconcile or a layout decision is uncertain, encode it as a "pass" with a short reason — never invent a value to force reconciliation.

Do NOT invent dates, descriptions, or amounts. Reconstruct ONLY what the raw lines contain. If you are not confident about a line, output "pass" with confidence 0.`;
      break;
    }

    default:
      return null;
  }
  return base;
}

/**
 * Parse the AI response into an array of repair candidates.
 */
export function parseStructuredResponse(rawResponse, mode) {
  if (!rawResponse) return [];
  let arr = null;
  if (Array.isArray(rawResponse)) arr = rawResponse;
  else if (Array.isArray(rawResponse.repairs)) arr = rawResponse.repairs;
  else if (Array.isArray(rawResponse.decisions)) arr = rawResponse.decisions;
  else if (typeof rawResponse === 'string') {
    try {
      const parsed = JSON.parse(rawResponse);
      return parseStructuredResponse(parsed, mode);
    } catch {
      const m = rawResponse.match(/\[[\s\S]*\]/);
      if (m) {
        try {
          return parseStructuredResponse(JSON.parse(m[0]), mode);
        } catch {
          return [];
        }
      }
      return [];
    }
  } else if (rawResponse.decision) arr = [rawResponse];
  if (!arr) return [];
  return arr.map((c) => ({ ...c, mode }));
}

/**
 * Dispatch all classified batches to the AI and validate candidates.
 * Skips disabled stub modes even if a caller mistakenly populates them.
 * @param {object} batches — classified rescue items from classifyRescueItems
 * @param {object} aiClient — { runRescue(prompt) } interface (aiOrchestratorService)
 * @param {object} [context] — { existingTxns, pageWords } gate context
 * @returns {Promise<{ repairs: object[], stats: object }>}
 */
export async function dispatchRescueBatches(batches, aiClient, context = {}) {
  const allRepairs = [];
  const stats = {
    modesUsed: [],
    modesSkipped: [],
    repairsAttempted: 0,
    repairsAccepted: 0,
    rejected: [],
  };

  for (const [mode, items] of Object.entries(batches || {})) {
    if (!items?.length) continue;

    // Hard guard: disabled Phase-2 stubs never dispatch
    if (!ACTIVE_RESCUE_MODES.has(mode)) {
      stats.modesSkipped.push(mode);
      logger.info('[RESCUE] mode skipped (disabled stub)', { mode, itemCount: items.length });
      continue;
    }

    stats.modesUsed.push(mode);

    // RAW_LEDGER is one bounded call per unknown layout — never sliced.
    const batchSize = mode === RESCUE_MODES.RAW_LEDGER ? items.length : RESCUE_BATCH_SIZE;

    for (let i = 0; i < items.length; i += batchSize) {
      const batch = items.slice(i, i + batchSize);
      const prompt = buildRescuePrompt(mode, batch, context);
      if (!prompt) {
        stats.modesSkipped.push(mode);
        continue;
      }

      const rawResponse = await aiClient.runRescue({
        system: `${prompt.instruction}\n\nRules:\n- ${prompt.rules.join('\n- ')}`,
        user: JSON.stringify({ schema: prompt.schema, rows: prompt.rows, context: prompt.context }),
      });
      const candidates = parseStructuredResponse(rawResponse, mode);
      stats.repairsAttempted += candidates.length;

      // Enrich candidates with batch provenance (page, parent_row_id, token
      // text) so applyRepairs/findRemapTarget never depend on the model
      // echoing identifiers back. Match by evidence text within the batch.
      const enrichedCandidates = candidates.map((candidate) => {
        const evTexts = (candidate.evidence || []).map((ev) => String(ev.text || ''));
        const matchItem = batch.find((item) => {
          if (item.token?.text != null && evTexts.includes(String(item.token.text))) {
            return true;
          }
          if (item.words?.length && evTexts.some((t) => item.words.some((w) => w.text === t))) {
            return true;
          }
          return false;
        });
        if (!matchItem) return candidate;
        return {
          ...candidate,
          page: candidate.page ?? matchItem.page ?? matchItem.token?.page,
          parent_row_id: candidate.parent_row_id ?? matchItem.parent_row_id ?? null,
          token_text: candidate.token_text ?? matchItem.token?.text ?? null,
        };
      });

      for (const candidate of enrichedCandidates) {
        const generic = validateRepair(candidate, mode, context);
        const modeSpecific = validateModeSpecific(candidate, mode, context);
        const tier = assignTrustTier(candidate, mode, context);
        const confidence = Number(candidate.confidence ?? 0);
        const accepted =
          generic.passed && modeSpecific.passed && shouldAutoAccept(tier, confidence);

        if (accepted) {
          allRepairs.push({ ...candidate, trustTier: tier });
          stats.repairsAccepted += 1;
          logger.info('[RESCUE] repair applied', {
            mode,
            decision: candidate.decision,
            confidence,
            evidenceCount: candidate.evidence?.length,
            page: candidate.page,
            parentRowId: candidate.parent_row_id,
            proposedAmount: candidate.proposed_transaction?.amount_cents ?? candidate.proposed_amount,
            trustTier: tier,
          });
        } else {
          const failedGate = !generic.passed
            ? Object.entries(generic.results || {}).find(([, v]) => !v)?.[0]
            : !modeSpecific.passed
              ? `mode_specific:${mode}`
              : confidence < 0.9
                ? 'confidence_below_auto_accept'
                : 'trust_tier';
          stats.rejected.push({ mode, failedGate, decision: candidate.decision, confidence });
          logger.warn('[RESCUE] repair rejected', {
            mode,
            decision: candidate.decision,
            confidence,
            failedGate,
            rowIds: candidate.input_row_ids,
            reason: candidate.reason?.substring?.(0, 120),
          });
        }
      }
    }
  }

  return { repairs: allRepairs, stats };
}

/**
 * Find the transaction a dropped row should merge into:
 * 1. Explicit fingerprint/id match (repair.parent_row_id / parent_row_fingerprint)
 * 2. Same page, nearest transaction ABOVE the dropped row's top (vertical parent)
 * 3. Same page + same date (nearest_date)
 */
function findMergeParent(repaired, repair, pageWords) {
  const pid = repair.parent_row_id ?? repair.parent_row_fingerprint;
  if (pid != null) {
    const byId = repaired.transactions.find(
      (t) =>
        t.rowFingerprint === pid ||
        t.sourceHash === pid ||
        t.rowIndex === pid ||
        String(t.page ?? '') === String(pid)
    );
    if (byId) return byId;
  }

  const droppedPage = repair.page ?? (Array.isArray(repair.evidence) ? repair.evidence[0]?.page : null);
  const top =
    repair.top ??
    (Array.isArray(repair.evidence) ? repair.evidence[0]?.bbox?.[1] : null) ??
    null;

  let candidates = repaired.transactions;
  if (droppedPage != null) {
    candidates = candidates.filter((t) => t.page === droppedPage);
  }

  if (top != null) {
    // Nearest transaction whose pageY is above the dropped row's top
    const above = candidates
      .filter((t) => t.pageY != null && t.pageY <= top)
      .sort((a, b) => (b.pageY ?? 0) - (a.pageY ?? 0));
    if (above.length) return above[0];
  }

  if (repair.nearest_date) {
    const byDate = candidates
      .filter((t) => t.date === repair.nearest_date)
      .sort((a, b) => (b.pageY ?? 0) - (a.pageY ?? 0));
    if (byDate.length) return byDate[0];
  }

  return null;
}

/**
 * Find the transaction a COLUMN_REMAP repair targets:
 * same page + amount magnitude match (the token's dollar value).
 */
function findRemapTarget(repaired, repair) {
  const droppedPage = repair.page ?? repair.evidence?.[0]?.page ?? null;
  const proposed =
    repair.proposed_amount != null ? Math.abs(Number(repair.proposed_amount)) : null;
  const tokenText = repair.evidence?.[0]?.text ?? null;
  const tokenAmt = tokenText ? Math.abs(parseFloat(String(tokenText).replace(/[$,]/g, ''))) : null;

  let candidates = repaired.transactions;
  if (droppedPage != null) {
    candidates = candidates.filter((t) => t.page === droppedPage);
  }

  const match = candidates.find((t) => {
    const amt = Math.abs(Number(t.amount) || 0);
    if (proposed != null && Math.abs(amt - proposed) < 0.005) return true;
    if (tokenAmt != null && Math.abs(amt - tokenAmt) < 0.005) return true;
    return false;
  });
  return match || null;
}

/**
 * Build a repaired candidate by overlaying accepted repairs on a CLONE of the
 * base candidate. The base is never mutated.
 */
export function applyRepairs(baseCandidate, repairs) {
  const repaired = {
    transactions: [...(baseCandidate.transactions || [])],
    normalizedTransactions: [
      ...(baseCandidate.normalizedTransactions || baseCandidate.transactions || []),
    ],
    meta: { ...(baseCandidate.meta || {}) },
    // Preserve evidence so downstream still sees it
    droppedRows: baseCandidate.droppedRows ? [...baseCandidate.droppedRows] : undefined,
    uncertainAssignments: baseCandidate.uncertainAssignments
      ? [...baseCandidate.uncertainAssignments]
      : undefined,
  };

  // Give every transaction a stable array index for parent matching
  repaired.transactions.forEach((t, i) => {
    if (t.rowIndex == null) t.rowIndex = i;
  });

  for (const repair of repairs || []) {
    const pt = repair.proposed_transaction;
    const decision = String(repair.decision || '').toLowerCase();

    if (
      (repair.mode === RESCUE_MODES.DROP_REVIEW ||
        repair.mode === RESCUE_MODES.ROW_MERGE ||
        repair.mode === RESCUE_MODES.RAW_LEDGER) &&
      decision === 'promote_to_transaction' &&
      pt
    ) {
      const amount =
        pt.amount_cents != null ? Number(pt.amount_cents) / 100 : Number(pt.amount || 0);
      repaired.transactions.push({
        date: pt.txn_date,
        description: pt.description_raw || '',
        amount,
        type: amount >= 0 ? 'CREDIT' : 'DEBIT',
        balance: pt.balance ?? null,
        section: pt.section ?? null,
        source: 'ai_rescue',
        rescueMode: repair.mode,
        rowFingerprint: pt.rowFingerprint,
      });
    } else if (repair.mode === RESCUE_MODES.COLUMN_REMAP && decision === 'reassign') {
      const target = findRemapTarget(repaired, repair);
      if (target && repair.proposed_amount != null) {
        const amount = Number(repair.proposed_amount);
        target.amount = amount;
        target.type = amount >= 0 ? 'CREDIT' : 'DEBIT';
        target.source = 'ai_rescue_remap';
      }
    } else if (
      repair.mode === RESCUE_MODES.ROW_MERGE &&
      decision === 'merge_with_previous'
    ) {
      const parent = findMergeParent(repaired, repair, []);
      if (parent) {
        const continuation = repair.continuation_text || pt?.description_raw || '';
        if (continuation) {
          parent.description = `${parent.description || ''} ${continuation}`.trim();
          parent.source = parent.source || 'ai_rescue_merge';
        }
      }
    }
    // keep / discard / pass: no ledger change
  }

  repaired.normalizedTransactions = repaired.transactions;
  return repaired;
}

export default {
  RESCUE_MODES,
  ACTIVE_RESCUE_MODES,
  RAW_LEDGER_LINE_CAP,
  classifyRescueItems,
  buildRescuePrompt,
  parseStructuredResponse,
  dispatchRescueBatches,
  applyRepairs,
};
