---
name: AI Rescue — Phase 1 & Phase 3 Completion Plan
overview: "Finish Phase 1 (Python evidence wiring) and confirm Phase 3 (pipeline integration) is complete. Phase 1 gap: validate_evidence.py exists as a standalone script but is NOT wired into extract_tables.py."
tags: [helios, rescue, phase1, phase3]
---

# AI Rescue Redesign — Phase 1 & Phase 3 Completion Plan

## Status Check

| Phase | Tasks | Status |
|-------|-------|--------|
| **Phase 1** (Evidence Capture) | 1–4 | ✅ 3 of 4 done; 1 gap remaining |
| **Phase 3** (Pipeline Integration) | 8–9 | ✅ Fully implemented |

---

## Phase 1 Remaining: Wire Python-Side Schema Validation

**Gap:** `scripts/validate_evidence.py` exists as a standalone validator but is never called from `extract_tables.py`. Evidence schema violations are silent — they pass through to Node without validation.

### Task P1-Remaining: Call `validate_evidence.py` from `extract_tables.py`

**Objective:** Validate `dropped_rows` and `uncertain_assignments` against `rescueEvidenceSchema.json` before emitting JSON output. Fail open (log warning, emit anyway) so a schema violation never blocks extraction.

**Files:**
- Modify: `scripts/extract_tables.py`
- Reference: `scripts/validate_evidence.py` (existing, standalone)

**Approach:** Inline the validation in `extract_tables.py` to avoid a subprocess call. Import `jsonschema` at module level and validate at the end of `extract_wells()` and `extract_regions()` before returning.

```python
# Near top of extract_tables.py (after existing imports)
try:
    import jsonschema
    _SCHEMA_PATH = Path(__file__).resolve().parents[1] / "src" / "services" / "extraction" / "rescueEvidenceSchema.json"
    _EVIDENCE_SCHEMA = json.loads(_SCHEMA_PATH.read_text())
    _SCHEMA_AVAILABLE = True
except ImportError:
    _SCHEMA_AVAILABLE = False

def _validate_evidence(evidence: dict) -> None:
    """Validate dropped_rows and uncertain_assignments against the shared schema.
    Logs warnings on violations; never raises (fail-open)."""
    if not _SCHEMA_AVAILABLE:
        return
    errors = []
    for i, row in enumerate(evidence.get("dropped_rows", [])):
        try:
            jsonschema.validate(row, {"$ref": "#/definitions/droppedRow", "definitions": _EVIDENCE_SCHEMA["definitions"]})
        except jsonschema.ValidationError as exc:
            errors.append(f"dropped_rows[{i}]: {exc.message}")
    for i, row in enumerate(evidence.get("uncertain_assignments", [])):
        try:
            jsonschema.validate(row, {"$ref": "#/definitions/uncertainAssignment", "definitions": _EVIDENCE_SCHEMA["definitions"]})
        except jsonschema.ValidationError as exc:
            errors.append(f"uncertain_assignments[{i}]: {exc.message}")
    if errors:
        logger.warning("[EVIDENCE] schema violations", {"count": len(errors), "errors": errors[:5]})
```

**Call sites:** At the end of `extract_wells()` and `extract_regions()`, before the `return` statement, call `_validate_evidence({"dropped_rows": _DROPPED_ROWS, "uncertain_assignments": _UNCERTAIN_ASSIGNMENTS})`.

**Verification:** Run December extraction, confirm no schema violations in logs. Run with a deliberately malformed evidence payload, confirm it logs a warning but still emits JSON.

---

## Phase 3: Already Complete ✅

| Component | File | Status |
|-----------|------|--------|
| Rescue dispatcher | `aiRescueDispatcher.js` | ✅ Full — ROW_MERGE, COLUMN_REMAP, DROP_REVIEW, RAW_LEDGER + SECTION_TAG/BALANCE_FILL stubs |
| Acceptance gates | `rescueAcceptanceGate.js` | ✅ Schema, grounding, duplicate, date, amount, mode-specific gates |
| Cache service | `rescueCache.js` | ✅ Redis, compound key, 7-day TTL |
| Evidence schema | `rescueEvidenceSchema.json` | ✅ Shared Python↔Node contract |
| Pipeline wiring | `statementExtractionPipeline.js` | ✅ Candidate overlay pattern, cache check, reconcile, pick winner |
| Provider | `aiOrchestratorService.js` | ✅ `runRescue` with `RESCUE_PROVIDER` |
| Tests | `rawLedgerRescue.test.js` | ✅ 11/11 pass |

No remaining Phase 3 work needed.

---

## Execution Order

1. Wire `_validate_evidence()` into `extract_tables.py` (Phase 1 gap)
2. Run December + January + February extractions, confirm no schema violations
3. Confirm Phase 3 end-to-end: run pipeline on a statement with known dropped rows, verify rescue dispatcher fires and logs mode counts

## Risks

- `jsonschema` may not be installed in the Python environment — fail-open handles this
- If `rescueEvidenceSchema.json` is updated, both Python and Node validators need to stay in sync — the shared schema file is the single source of truth
