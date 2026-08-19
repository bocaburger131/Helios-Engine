# AI Rescue Redesign: Bounded Ambiguity Resolver

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.
> **Priority:** ROW_MERGE and COLUMN_REMAP first (address $12,981 Dec gap), then DROP_REVIEW, then SECTION_TAG/BALANCE_FILL.

**Goal:** Replace the current page-level AI re-extraction with a surgical, evidence-grounded ambiguity resolver that activates only on rows the deterministic parser cannot handle.

**Architecture:** Three-stage sidecar — (1) Parser extracts + flags uncertain rows with evidence, (2) AI resolves only flagged subsets via specialized modes producing **repair candidates that overlay the base ledger** (never mutate directly), (3) Programmatic acceptance gates with **trust tiers** validate every repair. AI is a repair candidate generator, never the final authority. Repairs are applied as candidate overlays — the base + repair candidate is reconciled and compared to the base alone; the better checksum wins.

**Critical design rule:** AI repairs are candidate overlays, NOT direct ledger mutations. The parser's output is the base candidate. AI produces a repair set. Reconciliation runs on both; the pipeline picks the one with the better checksum.

**Tech Stack:** Python (extract_tables.py for evidence capture), Node.js (rescue dispatcher, acceptance gates), Gemini (AI provider via existing aiOrchestratorService.js)

**Current state:** December checksum $12,981, January -$7,824, February broken at profile level. All false positives removed. Remaining gap: continuation-row artifacts + missing transactions.

---

## Trust Tiers

Every AI repair candidate is assigned a trust tier. Only higher tiers are auto-accepted.

| Tier | Criteria | Auto-Accept? |
|------|----------|-------------|
| **Grounded only** | Evidence bbox exists in page | ❌ Review queue |
| **Grounded + locally plausible** | Above + date/amount/section consistent with neighbors | ❌ Review queue |
| **Grounded + statement-improving** | Above + checksum delta improves or balance coverage increases | ✅ If confidence ≥ 0.9 |
| **Grounded + human-approved** | Manually reviewed and flagged | ✅ Always |

**Human-review thresholds (defined now, not left open):**

| Confidence | Gates Passed | Action |
|-----------|-------------|--------|
| ≥ 0.9 | All mode-specific gates | Auto-accept |
| 0.7 – 0.89 | All mode-specific gates | Review queue |
| < 0.7 | Any | Reject (unless manually approved) |

---

## Per-Mode Acceptance Rules

Each rescue mode has mode-specific validation beyond the generic gates:

| Mode | Required Improvement |
|------|---------------------|
| **ROW_MERGE** | Must improve date+amount completeness. Must NOT create duplicate row fingerprints. |
| **COLUMN_REMAP** | Must improve balance coverage OR printed-total alignment. Must NOT flip both amount and balance ambiguously. |
| **DROP_REVIEW** | Must prove the row is NOT summary_only, header, or subtotal before promotion. |
| **SECTION_TAG** | Must align with at least one neighboring row's section. Cannot contradict section heading text. |
| **BALANCE_FILL** | Must improve balance-sequence continuity. Must NOT create duplicate amounts. |

---

## Caching

Rescue outputs are cached by compound key to reduce cost and stabilize debugging:

```
Cache key = sha256(document_hash + parser_version + rescue_mode + row_ids_hash + evidence_hash + model_version)
```

- **Document hash:** SHA-256 of the PDF buffer
- **Parser version:** Git SHA of extract_tables.py + commit timestamp
- **Rescue mode:** e.g., "ROW_MERGE"
- **Row IDs hash:** SHA-256 of the concatenated evidence row IDs
- **Evidence hash:** SHA-256 of the full evidence payload (word coordinates, neighboring context, parser alternatives) — prevents cache collision when same row IDs carry different data
- **Model version:** e.g., "gemini-3.5-flash"

Cache lives in Redis (same instance as the pipeline) with a 7-day TTL. Cache hits skip the AI call entirely and return the stored repair candidate.

---

## Shared Evidence Schema

A single schema file defines the contract between Python and Node. Both sides validate against it.

**File:** `src/services/extraction/rescueEvidenceSchema.json`

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "definitions": {
    "droppedRow": {
      "type": "object",
      "required": ["page", "drop_reason"],
      "properties": {
        "page": {"type": "integer"},
        "drop_reason": {"enum": ["no_date", "empty_description", "reference_number", "summary_match", "balance_artifact", "amount_cap", "routing_bleed"]},
        "words": {"type": "array", "items": {"$ref": "#/definitions/word"}},
        "amount": {"type": "number"},
        "date": {"type": "string"},
        "description": {"type": "string"},
        "nearest_date": {"type": "string"},
        "parent_row_id": {"type": "integer"}
      }
    },
    "uncertainAssignment": {
      "type": "object",
      "required": ["page", "reason", "token", "assigned_column", "alternative_column"],
      "properties": {
        "page": {"type": "integer"},
        "reason": {"enum": ["column_boundary", "amount_balance_ambiguity"]},
        "token": {"$ref": "#/definitions/word"},
        "assigned_column": {"type": "integer"},
        "alternative_column": {"type": "integer"},
        "distance_to_boundary_pt": {"type": "number"},
        "parent_row_id": {"type": "integer"}
      }
    },
    "word": {
      "type": "object",
      "required": ["text", "x0", "x1", "top", "bottom"],
      "properties": {
        "text": {"type": "string"},
        "x0": {"type": "number"},
        "x1": {"type": "number"},
        "top": {"type": "number"},
        "bottom": {"type": "number"}
      }
    }
  }
}
```

Python validates evidence output against this schema before emitting. Node validates against it on receipt.

---

## Failure Accounting

Every rejected repair is logged with the specific gate that failed — not a generic "AI rescue failed."

```javascript
logger.warn('[RESCUE] repair rejected', {
  mode,
  decision: repair.decision,
  confidence: repair.confidence,
  failedGate: gateResults.find(g => !g.passed)?.name,
  rowIds: repair.input_row_ids,
  reason: repair.reason?.substring(0, 120),
});
```

**Terminal behavior:** Rescue outcomes have specific terminal classes:

| Outcome | Class | Description |
|---------|-------|-------------|
| Rescue not needed | `RESCUE_SKIPPED` | No flagged rows |
| All repairs accepted | `RESCUE_APPLIED` | All candidates passed gates |
| Partial acceptance | `RESCUE_PARTIAL` | Some accepted, some rejected |
| All repairs rejected | `RESCUE_REJECTED` | No candidates passed gates |
| AI call failed | `RESCUE_ERROR` | Network/auth/model error |

The pipeline's `rescueAttempted` flag is replaced with `rescueOutcome` carrying one of these classes.

---

## Row Context Size for Prompts

Each rescue prompt includes precisely defined neighboring context:

| Context Element | Included | Rationale |
|----------------|----------|-----------|
| Previous row (full) | ✅ | Needed to judge merge decisions |
| Next row (full) | ✅ | Disambiguates continuation from new transaction |
| Column ranges | ✅ | Needed for COLUMN_REMAP decisions |
| Section heading | ✅ | Needed for SECTION_TAG and context |
| Page header row | ❌ | Already encoded in column ranges |
| Full page text | ❌ | Too much — defeats narrow-scope design |

---

## Module Responsibility Audit

### `scripts/extract_tables.py` (2084 lines)

**Job:** PDF word extraction → table assembly → transaction row emission

**Issues found:**
- 🐛 `emit_transaction_row` silently drops rows — no record of what was dropped or why
- 🔧 No evidence capture for dropped rows (they carry amounts but fail date/desc validation)
- 🔧 Pre-merge logs (ROW_MERGE) exist but are unstructured stderr — not parseable by Node
- ✅ Two-line header detector, pre-merge function, column-range assignment — all correct
- ✅ Continuation merging preserves word-level bbox data

### `src/services/extraction/statementExtractionPipeline.js` (502 lines)

**Job:** Rescue chain — AI diagnostic → tolerance sweep → COLUMN_FLIP correction

**Issues found:**
- 🐛 Current "rescue" replaces ALL transactions, not just uncertain ones
- 🐛 Tolerance sweep (15/20/10) is brute-force — re-extracts entire document
- 🐛 No evidence grounding — AI returns free-text JSON with no source tracing
- 🐛 No programmatic acceptance gates — AI output accepted if checksum passes
- 🔧 The `aiDiagnostic` call sends `columnStats` but receives generic diagnosis — no actionable row-level guidance

### `src/services/aiOrchestratorService.js` (147 lines)

**Job:** Provider-agnostic LLM router for vision/categorization/diagnostic

**Issues found:**
- ✅ Clean abstraction — single provider-agnostic entry point
- 🔧 Only supports text diagnosis currently — needs structured output parsing for rescue modes
- 🔧 No retry or error recovery beyond single call

### `src/services/extraction/pdfPlumberService.js` (256 lines)

**Job:** Python sidecar wrapper — runs extract_tables.py, parses debug lines

**Issues found:**
- ✅ Solid — clean process management, timeout handling
- 🔧 Parses DEBUG lines but no structured evidence format from Python

### `src/services/extraction/plumberRowNormalizer.js` (117 lines)

**Job:** Normalizes Python JSON output to Node transaction format

**Issues found:**
- ✅ Clean mapping — date, amount, type, section, balance
- 🔧 No pass-through for provenance fields (sourceHash, rowFingerprint) or drop reasons

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                  PDF → Python Sidecar                   │
│  extract_tables.py                                      │
│  ┌──────────────────────────────────────────────────┐  │
│  │ Deterministic Extraction                         │  │
│  │  ├─ Word clustering + pre-merge                  │  │
│  │  ├─ Header detection (two-line)                  │  │
│  │  ├─ Column-range assignment                     │  │
│  │  ├─ Row assembly + date/amount validation        │  │
│  │  ├─ Emit: {transactions[], pageTelemetry[]}      │  │
│  │  └─ NEW: Emit: {dropped_rows[], uncertain_rows[]}│  │
│  └──────────────────────────────────────────────────┘  │
└───────────────────────┬─────────────────────────────────┘
                        │ JSON with evidence
                        ▼
┌─────────────────────────────────────────────────────────┐
│              Node.js Rescue Dispatcher                   │
│  aiRescueDispatcher.js (NEW)                            │
│  ┌──────────────────────────────────────────────────┐  │
│  │ 1. Receive: {transactions, dropped, uncertain}    │  │
│  │ 2. Classify each flag into rescue mode           │  │
│  │ 3. Batch by mode (ROW_MERGE, COLUMN_REMAP, etc.) │  │
│  │ 4. Send only relevant rows + bboxes to AI        │  │
│  │ 5. Receive structured repair candidates          │  │
│  │ 6. Run acceptance gates                          │  │
│  │ 7. Apply accepted repairs → emit final txns      │  │
│  └──────────────────────────────────────────────────┘  │
└───────────────────────┬─────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────┐
│              Acceptance Gates (NEW)                      │
│  rescueAcceptanceGate.js                                │
│  ┌──────────────────────────────────────────────────┐  │
│  │ Per repair:                                      │  │
│  │  □ JSON schema validation                        │  │
│  │  □ Evidence grounding (bbox exists in page)      │  │
│  │  □ Duplicate detection (no existing txn match)   │  │
│  │  □ Date plausibility (within statement period)   │  │
│  │  □ Amount sanity (not > $250K, not 0)            │  │
│  │  □ Section consistency (matches nearby rows)     │  │
│  │  □ Checksum improvement (required for auto-accept)│  │
│  └──────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

---

## Data Flow: Evidence Format

Python sidecar emits new top-level fields alongside `transactions`:

```json
{
  "transactions": [...],
  "dropped_rows": [
    {
      "page": 3,
      "drop_reason": "no_date",
      "words": [
        {"text": "S464333599436795", "x0": 150.0, "x1": 217.0, "top": 568.5, "bottom": 577.0},
        {"text": "Card", "x0": 217.2, "x1": 232.0, "top": 568.5, "bottom": 577.0},
        {"text": "6932", "x0": 234.5, "x1": 252.0, "top": 568.5, "bottom": 577.0}
      ],
      "nearest_date": "12/2",
      "parent_row_id": 25
    }
  ],
  "uncertain_assignments": [
    {
      "page": 3,
      "reason": "column_boundary",
      "token": {"text": "265.89", "x0": 484.5, "x1": 520.0, "top": 559.5, "bottom": 568.0},
      "assigned_column": "withdrawals",
      "alternative_column": "credits",
      "distance_to_boundary_pt": 2.5,
      "parent_row_id": 31
    }
  ]
}
```

---

## Tasks

### Phase 1: Evidence Capture (Python Sidecar)

#### Task 1: Add `dropped_rows` collection to `emit_transaction_row`

**Objective:** Track every row that fails validation with its words, reason, and context

**Files:**
- Modify: `scripts/extract_tables.py`

**Step 1: Add module-level accumulator**

```python
# Near line 50, after existing module-level state
_DROPPED_ROWS: list[dict[str, Any]] = []
_UNCERTAIN_ASSIGNMENTS: list[dict[str, Any]] = []

def reset_evidence() -> None:
    global _DROPPED_ROWS, _UNCERTAIN_ASSIGNMENTS
    _DROPPED_ROWS = []
    _UNCERTAIN_ASSIGNMENTS = []
```

**Step 2: Modify `emit_transaction_row` to record drops**

In each `return` path before the actual return, append to `_DROPPED_ROWS`:

```python
def emit_transaction_row(...):
    desc = description.strip()
    if not desc or len(desc) < 2:
        _DROPPED_ROWS.append({
            "page": page, "drop_reason": "empty_description",
            "amount": amount, "date": date, "words": raw_cells
        })
        return
    if REFERENCE_NUMBER_RE.match(desc):
        _DROPPED_ROWS.append({
            "page": page, "drop_reason": "reference_number",
            "description": desc, "amount": amount, "date": date
        })
        return
    # ... existing filters — add _DROPPED_ROWS.append() to each early return
```

**Verification:** Run December extraction, grep for `"dropped_rows"` in output JSON.

---

#### Task 2: Add `uncertain_assignments` collection to `_row_words_to_cells`

**Objective:** Flag tokens near column boundaries with alternative column assignments

**Files:**
- Modify: `scripts/extract_tables.py`

**Step 1: After column assignment, check boundary proximity**

In `_row_words_to_cells`, after `col = _word_to_cell_by_range(x0, col_ranges)`:

```python
if col_ranges and t and MONEY_RE.match(t):
    col_range = col_ranges[col] if col < len(col_ranges) else None
    # Check distance to nearest boundary
    if col_range:
        dist_left = x0 - col_range[0]
        dist_right = col_range[1] - x0
        boundary_dist = min(dist_left, dist_right)
        if boundary_dist < _BOUNDARY_THRESHOLD_PT:
            alt_col = col + 1 if dist_right < dist_left else col - 1
            if 0 <= alt_col < len(col_ranges):
                _UNCERTAIN_ASSIGNMENTS.append({
                    "page": "?",
                    "reason": "column_boundary",
                    "token": {"text": t, "x0": x0, "x1": float(w.get("x1", 0)),
                              "top": float(w.get("top", 0)), "bottom": float(w.get("bottom", 0))},
                    "assigned_column": col,
                    "alternative_column": alt_col,
                    "distance_to_boundary_pt": round(boundary_dist, 1),
                })
```

**Verification:** Run December with `--diagnose-columns`, check for `"uncertain_assignments"` in output.

---

#### Task 3: Expose evidence in `extract_wells()` output

**Objective:** Add `dropped_rows` and `uncertain_assignments` to the JSON output

**Files:**
- Modify: `scripts/extract_tables.py`

**Step 1: Call `reset_evidence()` at start of `extract_wells()`**

```python
def extract_wells(pdf_path):
    reset_evidence()
    # ... existing code
```

**Step 2: Add to return dict**

```python
return {
    "transactions": deduped,
    "dropped_rows": _DROPPED_ROWS,
    "uncertain_assignments": _UNCERTAIN_ASSIGNMENTS,
    "openingBalance": opening,
    "closingBalance": closing,
    "metadata": { ... }
}
```

Do the same for `extract_regions()`.

**Verification:** Run December, confirm JSON has `dropped_rows` and `uncertain_assignments` arrays.

---

#### Task 4: Update `plumberRowNormalizer.js` to pass through evidence

**Objective:** Carry `dropped_rows` and `uncertain_assignments` through the Node normalizer

**Files:**
- Modify: `src/services/extraction/plumberRowNormalizer.js`

**Step 1: Add evidence fields to `normalizePlumberJson` return**

```javascript
export function normalizePlumberJson(raw) {
  const transactions = (raw.transactions || []).map(normalizeOne);
  return {
    transactions,
    normalizedTransactions: transactions,
    droppedRows: raw.dropped_rows || [],
    uncertainAssignments: raw.uncertain_assignments || [],
    meta: {
      openingBalance: raw.openingBalance,
      closingBalance: raw.closingBalance,
      pageTelemetry: buildPageTelemetry(raw),
    }
  };
}
```

**Verification:** Run full-pipeline-test.mjs, check result has `droppedRows` and `uncertainAssignments`.

---

### Phase 2: Rescue Dispatcher (Node.js)

#### Task 5: Create `aiRescueDispatcher.js`

**Objective:** Central dispatcher that classifies evidence into rescue modes and routes to AI

**Files:**
- Create: `src/services/extraction/aiRescueDispatcher.js`

**Step 1: Define mode classification function**

```javascript
import logger from '../../utils/logger.js';

export const RESCUE_MODES = {
  ROW_MERGE: 'ROW_MERGE',
  COLUMN_REMAP: 'COLUMN_REMAP',
  DROP_REVIEW: 'DROP_REVIEW',
  SECTION_TAG: 'SECTION_TAG',
  BALANCE_FILL: 'BALANCE_FILL',
};

/**
 * @param {object} evidence — { droppedRows, uncertainAssignments, transactions, pageTelemetry }
 * @returns {object} — { modeCounts, batches: { ROW_MERGE: [...], COLUMN_REMAP: [...], ... } }
 */
export function classifyRescueItems(evidence) {
  const batches = {
    [RESCUE_MODES.ROW_MERGE]: [],
    [RESCUE_MODES.COLUMN_REMAP]: [],
    [RESCUE_MODES.DROP_REVIEW]: [],
  };

  // ROW_MERGE: dropped rows with money tokens + no date + near parent
  for (const dr of evidence.droppedRows || []) {
    if (dr.drop_reason === 'no_date' || dr.drop_reason === 'empty_description') {
      if (dr.amount != null && dr.amount !== 0) {
        batches[RESCUE_MODES.ROW_MERGE].push(dr);
      }
    }
  }

  // COLUMN_REMAP: uncertain assignments at column boundaries
  for (const ua of evidence.uncertainAssignments || []) {
    if (ua.reason === 'column_boundary') {
      batches[RESCUE_MODES.COLUMN_REMAP].push(ua);
    }
  }

  // DROP_REVIEW: all other dropped rows with money
  for (const dr of evidence.droppedRows || []) {
    if (dr.amount != null && dr.amount !== 0 &&
        dr.drop_reason !== 'no_date' && dr.drop_reason !== 'empty_description') {
      batches[RESCUE_MODES.DROP_REVIEW].push(dr);
    }
  }

  const modeCounts = {};
  for (const [mode, items] of Object.entries(batches)) {
    modeCounts[mode] = items.length;
  }

  return { modeCounts, batches };
}
```

**Step 2: Add dispatch function**

```javascript
/**
 * @param {object} batches — classified rescue items
 * @param {object} aiClient — aiOrchestratorService interface
 * @returns {Promise<object>} — { repairs: [...], stats: {...} }
 */
export async function dispatchRescueBatches(batches, aiClient) {
  const allRepairs = [];
  const stats = { modesUsed: [], repairsAttempted: 0, repairsAccepted: 0 };

  for (const [mode, items] of Object.entries(batches)) {
    if (!items.length) continue;
    stats.modesUsed.push(mode);

    // Group into batches of ≤10 items to keep prompts focused
    for (let i = 0; i < items.length; i += 10) {
      const batch = items.slice(i, i + 10);
      const prompt = buildRescuePrompt(mode, batch);
      const rawResponse = await aiClient.runDiagnostic(prompt);
      const candidates = parseStructuredResponse(rawResponse, mode);
      stats.repairsAttempted += candidates.length;

      for (const candidate of candidates) {
        if (validateRepair(candidate, mode)) {
          allRepairs.push(candidate);
          stats.repairsAccepted++;
        }
      }
    }
  }

  return { repairs: allRepairs, stats };
}
```

**Verification:** Unit test with mock evidence, verify classification counts.

---

#### Task 6: Create `rescueAcceptanceGate.js`

**Objective:** Validate every AI repair candidate before acceptance

**Files:**
- Create: `src/services/extraction/rescueAcceptanceGate.js`

**Step 1: Schema validation**

```javascript
const RESCUE_SCHEMAS = {
  ROW_MERGE: ['decision', 'confidence', 'reason', 'evidence', 'proposed_transaction'],
  COLUMN_REMAP: ['decision', 'confidence', 'reason', 'evidence', 'proposed_column', 'proposed_amount'],
  DROP_REVIEW: ['decision', 'confidence', 'reason', 'evidence', 'proposed_transaction'],
};

export function validateSchema(candidate, mode) {
  const required = RESCUE_SCHEMAS[mode];
  if (!required) return false;
  return required.every(field => field in candidate);
}
```

**Step 2: Evidence grounding check**

```javascript
export function validateGrounding(candidate, pageWords) {
  if (!candidate.evidence || !Array.isArray(candidate.evidence)) return false;
  return candidate.evidence.every(ev => {
    // Verify ev.text appears in pageWords at ev.bbox
    if (!ev.text || !ev.bbox) return false;
    const match = pageWords.find(w =>
      w.text === ev.text &&
      Math.abs(w.x0 - ev.bbox[0]) < 3 &&
      Math.abs(w.top - ev.bbox[1]) < 3
    );
    return !!match;
  });
}
```

**Step 3: All gates combined**

```javascript
export function validateRepair(candidate, mode, context = {}) {
  const gates = [
    { name: 'schema', fn: () => validateSchema(candidate, mode) },
    { name: 'grounding', fn: () => validateGrounding(candidate, context.pageWords || []) },
    { name: 'duplicate', fn: () => !isDuplicate(candidate, context.existingTxns || []) },
    { name: 'date', fn: () => isValidDate(candidate.proposed_transaction?.txn_date) },
    { name: 'amount', fn: () => Math.abs(candidate.proposed_transaction?.amount_cents || 0) > 0 },
  ];

  const results = {};
  let allPassed = true;
  for (const gate of gates) {
    results[gate.name] = gate.fn();
    if (!results[gate.name]) allPassed = false;
  }
  return { passed: allPassed, results };
}
```

**Verification:** Unit test with valid and invalid repair candidates.

---

#### Task 7: Build specialized prompts for each mode

**Objective:** Narrow, evidence-grounded prompts per rescue mode

**Files:**
- Modify: `src/services/extraction/aiRescueDispatcher.js`

**Step 1: `buildRescuePrompt(mode, batch)` function**

```javascript
function buildRescuePrompt(mode, batch) {
  const base = {
    instruction: '',
    schema: getSchemaJson(mode),
    rows: batch,
    rules: [
      'Use ONLY the supplied rows and bounding boxes.',
      'Cite evidence by bbox — do not invent amounts.',
      'If uncertain, set decision to "pass" and confidence to 0.',
      'Return valid JSON matching the schema exactly.',
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

    case RESCUE_MODES.COLUMN_REMAP:
      base.instruction = `You are reviewing money tokens that fall near column boundaries and may be assigned to the wrong column.

For each uncertain assignment:
- If the token's x-position clearly belongs in the alternative column based on nearby tokens, decide "reassign".
- If the current assignment is correct, decide "keep".
- If ambiguous, decide "keep" with low confidence.

Return a JSON array with the proposed column and amount.`;
      break;

    case RESCUE_MODES.DROP_REVIEW:
      base.instruction = `You are reviewing rows that were rejected by the parser.

For each dropped row:
- If it contains a date + description + valid money amount, decide "promote_to_transaction".
- If it's a summary line, header, or artifact, decide "discard".
- If it's a continuation fragment, decide "merge_with_previous".

Return a JSON array with proposed transactions where applicable.`;
      break;
  }
  return base;
}
```

**Verification:** Test prompt generation with mock batch data.

---

#### Task 7b: Create `rescueEvidenceSchema.json` (shared contract)

**Objective:** Single schema file validated by both Python and Node

**Files:**
- Create: `src/services/extraction/rescueEvidenceSchema.json`
- Create: `scripts/validate_evidence.py` (Python validator)
- Modify: `src/services/extraction/plumberRowNormalizer.js` (Node validator)

**Step 1: Create schema file** (content from Shared Evidence Schema section above)

**Step 2: Python-side validation**

```python
# scripts/validate_evidence.py
import json, sys, jsonschema
schema = json.load(open('src/services/extraction/rescueEvidenceSchema.json'))
evidence = json.load(sys.stdin)
jsonschema.validate(evidence, schema)
```

Run at end of `extract_wells()` before emitting JSON.

**Step 3: Node-side validation**

```javascript
// In plumberRowNormalizer.js
import schema from './rescueEvidenceSchema.json' assert { type: 'json' };
import Ajv from 'ajv';
const ajv = new Ajv();
const validate = ajv.compile(schema);

export function normalizePlumberJson(raw) {
  // ... existing normalization ...
  if (raw.dropped_rows) {
    for (const dr of raw.dropped_rows) {
      if (!validate({ droppedRow: dr })) {
        logger.warn('[PLUMBER] evidence schema violation', { errors: validate.errors });
      }
    }
  }
  // ... return ...
}
```

**Verification:** Run December, confirm no schema violations.

---

#### Task 7c: Add rescue caching service

**Objective:** Cache rescue outputs by compound key to avoid redundant AI calls

**Files:**
- Create: `src/services/extraction/rescueCache.js`

**Step 1: Cache key builder**

```javascript
import crypto from 'node:crypto';

export function buildRescueCacheKey(docHash, batches, evidencePayload) {
  const rowIds = Object.values(batches).flat().map(r => r.parent_row_id || '').sort().join(',');
  const rowIdsHash = crypto.createHash('sha256').update(rowIds).digest('hex').slice(0, 16);
  // Evidence hash: protects against same row IDs with different coordinates/context
  const evidenceStr = JSON.stringify(evidencePayload || {});
  const evidenceHash = crypto.createHash('sha256').update(evidenceStr).digest('hex').slice(0, 16);
  const modeStr = Object.entries(batches)
    .filter(([_, items]) => items.length > 0)
    .map(([mode, items]) => `${mode}:${items.length}`)
    .join('|');
  const modelVersion = process.env.GEMINI_DIAGNOSTIC_MODEL || 'gemini-3.5-flash';
  const parserVersion = process.env.PARSER_VERSION || 'dev';
  return `rescue:${docHash}:${parserVersion}:${modeStr}:${rowIdsHash}:${evidenceHash}:${modelVersion}`;
}
```

**Step 2: Redis get/set with 7-day TTL**

```javascript
import { getRedisClient } from '../../config/redis.js';

const RESCUE_CACHE_TTL = 7 * 24 * 60 * 60; // 7 days

export async function getCachedRescue(cacheKey) {
  try {
    const redis = getRedisClient();
    const raw = await redis.get(cacheKey);
    return raw ? JSON.parse(raw) : null;
  } catch (err) {
    logger.warn('[RESCUE_CACHE] read failed', { error: err.message });
    return null;
  }
}

export async function setCachedRescue(cacheKey, data) {
  try {
    const redis = getRedisClient();
    await redis.set(cacheKey, JSON.stringify(data), 'EX', RESCUE_CACHE_TTL);
  } catch (err) {
    logger.warn('[RESCUE_CACHE] write failed', { error: err.message });
  }
}
```

**Verification:** Run December twice; second run should show cache hit in logs.

---

#### Task 7d: Update `rescueAcceptanceGate.js` with per-mode rules and trust tiers

**Objective:** Add mode-specific validation and trust tier assignment

**Files:**
- Modify: `src/services/extraction/rescueAcceptanceGate.js`

**Step 1: Mode-specific gate functions**

```javascript
function validateRowMerge(repair, context) {
  // Must improve date+amount completeness
  if (!repair.proposed_transaction?.txn_date) return false;
  if (!repair.proposed_transaction?.amount_cents) return false;
  // Must not create duplicate row fingerprint
  const fp = repair.proposed_transaction.rowFingerprint;
  if (fp && context.existingTxns?.some(t => t.rowFingerprint === fp)) return false;
  return true;
}

function validateColumnRemap(repair, context) {
  // Must improve balance coverage or printed-total alignment
  // Must not flip both amount AND balance ambiguously
  if (repair.proposed_column == null) return false;
  if (repair.flips_amount && repair.flips_balance) return false;
  return true;
}

function validateDropReview(repair, context) {
  // Must prove row is not summary_only, header, or subtotal
  const desc = (repair.proposed_transaction?.description_raw || '').toLowerCase();
  if (/^(?:totals?|summary|subtotal)\b/.test(desc)) return false;
  if (/\b(?:beginning|opening|ending|closing)\s+balance\b/.test(desc)) return false;
  return true;
}

const MODE_VALIDATORS = {
  ROW_MERGE: validateRowMerge,
  COLUMN_REMAP: validateColumnRemap,
  DROP_REVIEW: validateDropReview,
};
```

**Step 2: Trust tier assignment**

```javascript
export function assignTrustTier(repair, mode, context) {
  // Tier 1: Grounded only — evidence bboxes exist in page
  if (!validateGrounding(repair, context.pageWords)) return 'none';

  // Tier 2: Locally plausible — date/amount consistent with neighbors
  const locallyPlausible = isDatePlausible(repair, context) &&
    isAmountPlausible(repair, context) &&
    isSectionConsistent(repair, context);
  if (!locallyPlausible) return 'grounded';

  // Tier 3: Statement-improving — checksum or balance coverage improves
  // (computed by caller after reconciliation)
  return 'grounded_plus_local';
}

export function shouldAutoAccept(tier, confidence) {
  if (tier === 'none') return false;
  if (confidence >= 0.9) return true;  // grounded + locally plausible
  return false;  // requires human review
}
```

**Verification:** Unit test each mode validator with valid/invalid repair candidates.

---

### Phase 3: Pipeline Integration

#### Task 8: Wire rescue dispatcher into `statementExtractionPipeline.js`

**Objective:** Replace tolerance-sweep AI rescue with the evidence-grounded dispatcher

**Files:**
- Modify: `src/services/extraction/statementExtractionPipeline.js`
- Import: `src/services/extraction/aiRescueDispatcher.js`
- Import: `src/services/extraction/rescueAcceptanceGate.js`

**Step 1: After plumber extraction, classify, dispatch, and apply as candidate overlay**

Replace the current tolerance-sweep block (lines ~340-450) with the candidate-overlay pattern:

```javascript
// --- AI Rescue: candidate overlay pattern ---
// NEVER mutate extracted.transactions directly.
// Build a candidate: base + AI repairs → reconcile both → pick winner.
let rescueOutcome = 'RESCUE_SKIPPED';

if (extracted.droppedRows?.length || extracted.uncertainAssignments?.length) {
  const evidence = {
    droppedRows: extracted.droppedRows || [],
    uncertainAssignments: extracted.uncertainAssignments || [],
    transactions: extracted.transactions || [],
  };

  const { modeCounts, batches } = classifyRescueItems(evidence);
  logger.info('[STATEMENT_PIPELINE] AI rescue items classified', modeCounts);

  if (Object.values(modeCounts).some(c => c > 0)) {
    try {
      // Check cache first
      const docHash = sha256(ctx.pdfBuffer);
      const cacheKey = buildRescueCacheKey(docHash, batches);
      let { repairs, stats } = await getCachedRescue(cacheKey) || {};

      if (!repairs) {
        ({ repairs, stats } = await dispatchRescueBatches(batches, {
          runDiagnostic: (prompt) => aiDiagnosticService.runDiagnostic(prompt),
        }));
        await setCachedRescue(cacheKey, { repairs, stats });
      }

      logger.info('[STATEMENT_PIPELINE] AI rescue complete', stats);

      // Build repaired candidate (clone base, apply repairs)
      const baseCandidate = {
        transactions: [...extracted.transactions],
        normalizedTransactions: [...(extracted.normalizedTransactions || extracted.transactions)],
        meta: { ...extracted.meta },
      };

      const repairedCandidate = applyRepairs(baseCandidate, repairs);

      // Reconcile both candidates
      const baseRecon = reconcileRawBundle(baseCandidate, { profileId: profile.id });
      const repairedRecon = reconcileRawBundle(repairedCandidate, { profileId: profile.id });

      const baseDelta = Math.abs(baseRecon.reconciliationBreakdown?.computedClosing -
        baseRecon.reconciliationBreakdown?.closing || 0);
      const repairedDelta = Math.abs(repairedRecon.reconciliationBreakdown?.computedClosing -
        repairedRecon.reconciliationBreakdown?.closing || 0);

      // Pick the winner
      if (repairedDelta < baseDelta) {
        logger.info('[STATEMENT_PIPELINE] AI rescue IMPROVED checksum', {
          baseDelta, repairedDelta, improvement: baseDelta - repairedDelta
        });
        extracted = repairedCandidate;
        reconciliation = repairedRecon.reconciliationBreakdown;
        rescueOutcome = stats.repairsAccepted === stats.repairsAttempted
          ? 'RESCUE_APPLIED' : 'RESCUE_PARTIAL';
      } else {
        logger.info('[STATEMENT_PIPELINE] AI rescue did not improve checksum — keeping base', {
          baseDelta, repairedDelta
        });
        rescueOutcome = stats.repairsAccepted > 0 ? 'RESCUE_REJECTED' : 'RESCUE_SKIPPED';
      }
    } catch (err) {
      logger.warn('[STATEMENT_PIPELINE] AI rescue error', { error: err.message });
      rescueOutcome = 'RESCUE_ERROR';
    }
  }
}

// Store rescue outcome in meta for downstream consumers
extracted.meta = { ...(extracted.meta || {}), rescueOutcome };
```

**Verification:** Run full pipeline on December, confirm rescue dispatcher fires and logs mode counts.

---

#### Task 9: Add `RESCUE_PROVIDER` to `aiOrchestratorService.js`

**Objective:** New provider slot for rescue mode (text-only JSON, not vision)

**Files:**
- Modify: `src/services/aiOrchestratorService.js`

**Step 1: Add provider resolution**

```javascript
const RESCUE_PROVIDERS = ['gemini', 'claude'];

export function resolveRescueProvider() {
  return resolveProvider('RESCUE_PROVIDER', RESCUE_PROVIDERS, 'gemini');
}

export async function runRescue(prompt) {
  const provider = resolveRescueProvider();
  if (provider === 'gemini') return runGeminiDiagnostic(prompt);
  if (provider === 'claude') return runClaudeDiagnostic(prompt);
  throw new Error(`Unknown rescue provider: ${provider}`);
}
```

**Verification:** Call `runRescue` with a test prompt, verify response.

---

### Phase 4: Test and Validate

#### Task 10: Run December and measure improvement

**Objective:** Quantify checksum improvement from AI rescue

**Files:**
- None (test run only)

**Step 1: Run full pipeline on all three months**

```bash
node scripts/full-pipeline-test.mjs "test/Armani Food 25.pdf" 2>&1 | tee /tmp/dec-rescue.log
node scripts/full-pipeline-test.mjs "test/Armani Food Jan 25.pdf" 2>&1 | tee /tmp/jan-rescue.log
node scripts/full-pipeline-test.mjs "test/Armani Food Feb 25.pdf" 2>&1 | tee /tmp/feb-rescue.log
```

**Step 2: Compare against baseline**

| Metric | Baseline (no rescue) | After Rescue | Target |
|--------|---------------------|--------------|--------|
| Dec checksum | $12,981 | ? | < $1,000 |
| Jan checksum | -$7,824 | ? | < $1,000 |
| Feb checksum | Broken | ? | At least runs |

**Verification:** Confirm ROW_MERGE and COLUMN_REMAP modes repaired at least 10 rows each.

---

#### Task 11: Add rescue event logging for audit trail

**Objective:** Every repair is traceable — who made it, on what evidence, with what confidence

**Files:**
- Modify: `src/services/extraction/aiRescueDispatcher.js`

**Step 1: Log structured repair events**

```javascript
logger.info('[RESCUE] repair applied', {
  mode,
  decision: repair.decision,
  confidence: repair.confidence,
  evidenceCount: repair.evidence?.length,
  page: repair.page,
  parentRowId: repair.parent_row_id,
  proposedAmount: repair.proposed_transaction?.amount_cents,
});
```

**Verification:** Check log output for `[RESCUE]` entries with full evidence.

---

## Execution Order

```
Phase 1 (Evidence Capture):   Tasks 1→2→3→4     (~2 hours)
Phase 2 (Rescue Dispatcher):  Tasks 5→6→7→7b→7c→7d  (~4 hours)
Phase 3 (Pipeline Integration): Tasks 8→9       (~1.5 hours)
Phase 4 (Test & Validate):    Tasks 10→11        (~1 hour)

Total: 14 tasks, ~8.5 hours
```

## Risks

| Risk | Mitigation |
|------|-----------|
| AI rescue makes extraction worse | Candidate overlay — base ledger never mutated; winner picked by checksum |
| Too many rows flagged, API cost explodes | Batch limit (10/request) + Redis cache with compound key |
| Schema drift between Python evidence format and Node dispatcher | Shared JSON Schema validated on both sides |
| February profile failure blocks rescue | Rescue runs on Python output independently of profile |
| Cached rescue becomes stale after parser changes | Cache key includes parser version SHA |

## Resolved Questions (from review)

1. **Caching:** ✅ Yes — implemented as Task 7c with compound key
2. **Human-review thresholds:** ✅ Defined — ≥0.9 auto-accept, 0.7-0.89 review queue, <0.7 reject
3. **Candidate overlay vs. mutation:** ✅ Candidate overlay — base is never mutated
4. **SECTION_TAG and BALANCE_FILL:** Deferred to Phase 2 (after ROW_MERGE/COLUMN_REMAP/DROP_REVIEW prove out)
