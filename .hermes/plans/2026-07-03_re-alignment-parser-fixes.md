# Helios Engine — Re-Alignment Plan: Parser & Code Review Fixes
**Date:** 2026-07-03  
**Branch target:** `hermes/parser-fixes` off `main`  
**Scope:** Structural plan only — no code generated.

---

## Context & Assumptions

- The real parser entry point is `src/services/pdfParserService.js` (2,365 lines), called by `statementController.js` and `devParseRoutes.js`.
- The three stub parsers in `src/parsers/` (Chase, WF, BoA) are **not used** — they are dead stubs and are not part of this plan.
- `pdfPlumberService.js` delegates extraction to `scripts/extract_tables.py` (Python sidecar) via `pythonSidecarRunner.js`. That Python script is where the column-reading logic lives.
- `scanOcrService.js` delegates to `scripts/ocr_extract.py` — same Python sidecar bridge pattern.
- `statementExtractionPipeline.js` returns `checksumOk` but does **not** trigger OCR on failure — that hook is missing.
- `riskAnalysisService.temp.js` already imports `logger` — no missing import needed there (verified line 10).
- `demo-server.js` already applies `path.basename()` on the multer storage filename callback (line 51) but **not** on `req.file.originalname` used for display/logging at lines 162, 379, 440.
- `statementRoutes.js`: `upload.single/array` already runs before `validateBody` on most routes, but lines 84–85 and 94 apply `validateBody` directly after upload without auth middleware reorder issue confirmed — exact swap positions documented below.

---

## Fix 1 — Multi-Column Layout Logic in `extract_tables.py`

**Root cause:** `pdfplumber` extracts text using a left-to-right bounding box sweep. On 3-column statement layouts (Date | Description | Debit | Credit | Balance), rows from adjacent columns bleed horizontally — a debit amount lands in the credit column because both share the same Y-range.

### 1a — Dynamic Column Boundary Detection

**File:** `scripts/extract_tables.py`

**Current behavior:** Table extraction relies on pdfplumber's default `extract_table()` which auto-detects columns by whitespace gap analysis. On statements where columns share close X-coordinates (e.g., Wells Fargo multi-section), gaps are too narrow for the default strategy.

**Structural change:**
1. Add a `detect_column_boundaries(page)` function that:
   - Takes a pdfplumber `page` object
   - Calls `page.extract_words(x_tolerance=2, y_tolerance=3)` to get individual word bounding boxes
   - Builds a sorted histogram of X-coordinates across all words on the page
   - Identifies column separator gaps as X-ranges where no word appears (gap > configurable threshold, default 15pt)
   - Returns a list of `(x_start, x_end)` column band tuples

2. Replace the current single `extract_table()` call in the `extract_page_rows()` function with:
   - First call `detect_column_boundaries(page)` to get column bands
   - Crop each column band using `page.crop((x0, y0, x1, y1))` before extracting words
   - Assign each extracted word to its column band by X-midpoint
   - Reconstruct transaction rows by grouping words sharing the same Y-coordinate (tolerance ±3pt)

3. Add a `--column-debug` flag: when set, emit `COLUMN_DEBUG` lines to stderr with detected band counts and X-coordinates (mirrors existing `PDFPLUMBER_DEBUG` telemetry pattern).

**No hardcoded coordinates.** Boundaries are computed per-page per-document.

### 1b — Bank-Slug Routing to Column Strategy

**File:** `scripts/extract_tables.py`

The existing `--bank` argument (already passed via `bankSlug()` in `pdfPlumberService.js`) should gate which column-detection mode is used:

| Bank slug | Strategy |
|-----------|----------|
| `wells`   | 4-column mode (Date, Description, Amount, Balance) |
| `chase`   | 3-column mode (Date, Description, Amount+sign, Balance) |
| `regions` | 5-column mode (Date, Description, Debit, Credit, Balance) |
| `generic` | Auto-detect (histogram method from 1a) |

The bank slug is already flowing from `pdfPlumberService.js` → `pythonSidecarRunner.js` → `extract_tables.py` via `--bank`. No JS changes needed for routing.

### 1c — `pdfPlumberService.js` — Add Column Debug Telemetry Pass-Through

**File:** `src/services/extraction/pdfPlumberService.js`

The existing `parseDebugLines()` function parses `PDFPLUMBER_DEBUG` stderr lines. Add a parallel `parseColumnDebugLines()` export that matches `COLUMN_DEBUG` lines and attaches them to the existing `resultMeta.stderrDebug` object — no structural change to the JS service, just a new debug line parser following the existing pattern.

---

## Fix 2 — GitHub Code Review: Controller & Route Fixes

### 2a — Middleware Reordering in `statementRoutes.js`

**File:** `src/routes/statementRoutes.js`

**Problem:** Zod `validateBody(schema)` runs after `upload.single/array`, which is correct for form fields, but the Zod schemas for triage/batch routes validate `req.body` fields that are only populated by multer after the multipart body is parsed. On some routes the middleware order is correct already; the following lines need verification and potential swap:

| Line | Current order | Required order |
|------|---------------|----------------|
| 84  | `upload.single('statement'), validateBody(uploadStatementSchema)` | Keep as-is ✓ |
| 85  | `upload.array('statements', 20), validateBody(triageSchema)` | Keep as-is ✓ |
| 94  | `upload.array('statements', 20), validateBody(batchUploadSchema)` | Keep as-is ✓ |
| 101–103 | `...publicUploadChain, validateBody(triageSchema)` | Verify `publicUploadChain` includes multer before `validateBody` |
| 112 | `...publicUploadChain, validateBody(batchUploadSchema)` | Same as above |

**Structural change:** Inspect `publicUploadChain` definition (lines ~96–102). If multer is not the last element before `validateBody`, move it to the end of the chain array. No other routes need changes.

### 2b — Filename Sanitization in `demo-server.js`

**File:** `src/demo-server.js`

**Problem:** `req.file.originalname` is used raw for logging and file handling at three locations. A crafted filename like `../../../etc/passwd` can traverse paths if it ever reaches `fs` calls.

**Structural change:** Add `import path from 'node:path'` at top of file (if not already present). Wrap every `req.file.originalname` and `f.originalname` usage in `path.basename()` at these locations:

| Line | Expression | Fix |
|------|-----------|-----|
| 162 | `req.file.originalname` | `path.basename(req.file.originalname)` |
| 379 | `f.originalname` | `path.basename(f.originalname)` |
| 440 | `f.originalname || f.originalname` | `path.basename(f.originalname)` |

The multer `storage.filename` callback on line 51 already uses `path.basename()` — this fix brings display/logging paths into compliance.

### 2c — Optional Chaining in `statementController.js`

**File:** `src/controllers/statementController.js`

**Problem:** Alert array iteration at line ~5391–5394 accesses `allAlerts[i].code` without guarding against null/undefined alert objects. If a schema validation returns a null alert entry, this crashes with `TypeError: Cannot read properties of null`.

**Structural change:** At line 5394, the fix is already applied (`allAlerts[i]?.code`) per our prior code review work. **Verify this is actually present** in the current file before re-applying. Run: `grep -n "allAlerts\[i\]\?" src/controllers/statementController.js`.

### 2d — String Coercion in `logger.js`

**File:** `src/utils/logger.js`

**Problem:** `crypto.createHash('sha256').update(input)` throws if `input` is not a string or Buffer. A non-string message (object, Error, undefined) passed to the logger's hash function crashes the process.

**Structural change:** Verified at line 74: `const str = typeof input === 'string' ? input : String(input)` — **already applied**. Confirm the coercion guard is present before the `crypto.update()` call. If the `.broken` / `.old` / `.temp` variants of riskAnalysisService are ever imported instead of the canonical one, they do not affect logger.js.

### 2e — Logger Import in `riskAnalysisService.temp.js`

**File:** `src/services/riskAnalysisService.temp.js`

**Verified:** `import logger from '../utils/logger.js'` is present at line 10. **No change needed.** This item from the original code review is already resolved.

---

## Fix 3 — Automated OCR Rescue Pass on Checksum Failure

**Root cause:** When `checksumOk === false` at the end of `runStatementExtractionPipeline()`, the pipeline returns the bad result with no recovery attempt. The OCR service (`scanOcrService.js`) exists and is fully wired to `scripts/ocr_extract.py` but is never triggered from the extraction pipeline — it's only used for documents initially classified as scanned.

### 3a — OCR Rescue Hook in `statementExtractionPipeline.js`

**File:** `src/services/extraction/statementExtractionPipeline.js`

**Structural change:** After line 90 (where `extractionTier` is computed), add a conditional rescue block:

```
IF reconciliation.checksumOk === false
AND ctx.pdfBuffer is present (Buffer, not just text)
AND ctx.options.skipOcrRescue !== true
AND scanOcrEnabled() === true
THEN
  → call extractTransactionsFromPdfBuffer(ctx.pdfBuffer, { bankName, fileName }) from scanOcrService
  → re-run reconcileRawBundle() on the OCR result
  → if new checksumOk === true:
      replace extracted.transactions, reconciliation, extractionTier
      set meta.ocrRescueApplied = true
      set extractionTier = reconciliation.checksumOk ? 1 : null
  → if new checksumOk still false:
      keep original result, set meta.ocrRescueAttempted = true, meta.ocrRescueFailed = true
      log at WARN level with both checksum outcomes for comparison
```

**Import addition:** Add `import { extractTransactionsFromPdfBuffer as extractWithOcr, scanOcrEnabled } from './scanOcrService.js'` at the top of `statementExtractionPipeline.js`.

**Context requirement:** `ctx.pdfBuffer` must be passed into `runStatementExtractionPipeline()`. Currently `ctx` carries `text` (the pdf-parse text string) but not the raw buffer. The call sites in `pdfParserService.js` must be updated to pass `pdfBuffer` in the context object.

### 3b — Pass `pdfBuffer` Through Pipeline Context in `pdfParserService.js`

**File:** `src/services/pdfParserService.js`

**Structural change:** Locate the call to `runStatementExtractionPipeline(ctx)` (around line 1858 area, inside `parseStatement`). Augment the `ctx` object to include `pdfBuffer: buffer` so the rescue hook has access to the raw bytes. This is a one-field addition to the existing context object — no signature changes.

### 3c — `reconcileRawBundle` Already Available

**File:** `src/services/extraction/layoutPipeline/reconciliationService.js`

`reconcileRawBundle` is already exported and already imported into `statementExtractionPipeline.js` at line 6. The OCR rescue re-reconciliation call uses the same function — no new imports needed at the pipeline level beyond scanOcrService.

### 3d — Guard: Do Not Double-Rescue

Add `skipOcrRescue: true` to the options context when calling `runStatementExtractionPipeline` from within any recovery path (e.g., `tryRecoverWellsNearMiss`, `tryRecoverChaseFromPlumber`) to prevent a rescue-within-a-rescue loop.

---

## File Change Summary

| File | Type of change |
|------|---------------|
| `scripts/extract_tables.py` | Add `detect_column_boundaries()`, `extract_page_rows()` column-aware rebuild, `--column-debug` flag |
| `src/services/extraction/pdfPlumberService.js` | Add `parseColumnDebugLines()` telemetry parser |
| `src/routes/statementRoutes.js` | Verify `publicUploadChain` multer ordering (may be no-op if already correct) |
| `src/demo-server.js` | Wrap 3 `originalname` usages in `path.basename()` |
| `src/controllers/statementController.js` | Verify `allAlerts[i]?.code` optional chain at line 5394 (likely already applied) |
| `src/utils/logger.js` | Verify `String(input)` coercion guard (likely already applied) |
| `src/services/extraction/statementExtractionPipeline.js` | Add OCR rescue block + `import scanOcrService` |
| `src/services/pdfParserService.js` | Pass `pdfBuffer` in pipeline `ctx` at `runStatementExtractionPipeline` call sites |

---

## Execution Order

1. **Fix 2 (code review items)** — fast wins, low risk, surgical patches
   - 2b: `demo-server.js` basename wraps
   - 2c/2d/2e: verify already-applied guards in controller/logger/service
   - 2a: verify publicUploadChain middleware order

2. **Fix 1 (column layout)** — Python-only change until telemetry wiring
   - 1a + 1b: `extract_tables.py` column detection + bank routing
   - 1c: `pdfPlumberService.js` column debug line parser

3. **Fix 3 (OCR rescue)** — touches pipeline + service, medium risk
   - 3b: add `pdfBuffer` to `ctx` in `pdfParserService.js`
   - 3a: OCR rescue hook in `statementExtractionPipeline.js`
   - 3d: add `skipOcrRescue` guard to recovery paths

---

## Validation Steps (per fix)

**Fix 1:** Upload a known multi-column PDF (e.g., Regions Bank 5-column layout). Before: debit/credit columns bleed. After: `--column-debug` stderr shows correct band count; parsed transaction amounts match printed totals.

**Fix 2:** Run existing Vitest unit suite (`npm run test:unit`). Expect all passing — these are guard/sanitization changes, no behavioral change for valid inputs.

**Fix 3:** Feed a PDF that previously returned `checksumOk: false`. After: response includes `meta.ocrRescueApplied: true` and `checksumOk: true`, or `meta.ocrRescueFailed: true` if OCR also fails (which is acceptable — at least the attempt is logged).

---

## Risks & Open Questions

| Risk | Mitigation |
|------|-----------|
| `detect_column_boundaries()` may produce wrong bands on single-column statements | Fallback: if `<2` column bands detected, revert to existing `extract_table()` strategy |
| OCR rescue adds 10–30s latency per failed checksum | Gate behind `OCR_RESCUE_ENABLED` env var (default `true`), let operators disable in prod |
| `pdfBuffer` in ctx increases memory footprint for large PDFs | Buffer is already in scope — this is reference passing, not a copy |
| `publicUploadChain` middleware order in statementRoutes may already be correct | Verify before touching — if correct, this is a no-op |
