# FAST MODEL TASKS — Step 3 (Rule-Based Plumbing)

Handoff sheet for the fast-model tier. Source plan: `step_3_intelligence_+_dashboard_2e332bda.plan.md`.
FABLE-level tasks (B1 composer, B2 cash runway, B3 owner draw, B4 Python fallback guard) are
handled separately by Fable — do NOT touch `forensicIntelligence.js` runway code,
`macroAnalytics.js` owner-draw code, `intelligenceSummaryService.js`, or `scripts/extract_tables.py`.

Run after each task: `npx vitest run --config vitest.unit.config.js` (from `bank-statement-analyzer-api/`).

## Status

- [x] F1. Tolerance floor — DONE (already landed in `src/utils/statementParseQuality.js` + boundary tests in `tests/unit/statementParseQuality.test.js`). No action.
- [ ] F2. Garnishment alerts — enum step DONE, rules + wiring remaining (below).
- [ ] F3. Persist warnings to envelope201
- [ ] F4. Sync-201 warnings redirect
- [ ] F5. Warnings panel API fallback
- [ ] F6. Warnings redirect owner decision

## F2. Garnishment alert rules + AlertsEngine wiring (P2.8)

Already done: the three enum codes are in the alert schema of
`src/models/Statement.js` (after `OFAC_SCREENING_REQUIRED`):
`WAGE_GARNISHMENT_DETECTED`, `CHILD_SUPPORT_GARNISHMENT`, `TAX_LEVY_DETECTED`.

Remaining:

1. Detection rules. If `src/utils/garnishmentDetection.js` exists (Fable creates it for the
   B1 composer), import and reuse it — do not duplicate the regexes. Otherwise create it with:
   - `classifyGarnishment(description)` returning one of the three codes or `null`.
     Match priority (most specific first):
     - `CHILD_SUPPORT_GARNISHMENT`: /child\s*supp?(ort)?/i, /chld\s*sup/i, /\bcse\b/i,
       /support\s+enforcement/i, /state\s+disbursement/i, /\bsdu\b/i, county + child-support
       agency combos (/county\b.*(child|support|dcss)/i, /\bdcss\b/i).
     - `TAX_LEVY_DETECTED`: /tax\s*lev(y|ies)/i, /\birs\b.*(levy|lien)/i,
       /franchise\s+tax\s+board|\bftb\b.*(levy|lien)/i, /\bedd\b.*(levy|lien)/i,
       /state\s+tax\s+(levy|lien)/i.
     - `WAGE_GARNISHMENT_DETECTED` (generic catch-all): /garnish/i, /wage\s+(attach|assign)/i,
       /writ\s+of\s+garnishment/i, /legal\s+order\s+(debit|fee|processing)/i, /\blevy\b/i.
   - `detectGarnishments(transactions)` scanning OUTFLOWS only (`amount < 0` or `type` debit;
     reuse `isLedgerOutflow` from `src/utils/transactionNormalization.js`), returning
     `{ flags: [{ code, count, totalAmount, examples: [...max 5] }], hasGarnishment }`.
2. AlertsEngine wiring in `src/services/AlertsEngineService.js`:
   - Add static `_generateGarnishmentAlerts(finsightReport, reportIndex = 0)` following the
     shape of `_generateFraudIndicatorAlerts` (line ~1119). Guard on
     `finsightReport?.transactions`. For each detected flag push
     `{ code, type: 'COMPLIANCE', severity, title, message, data: { count, totalAmount, examples, reportIndex }, timestamp: new Date() }`.
     Severities: `CHILD_SUPPORT_GARNISHMENT` HIGH, `TAX_LEVY_DETECTED` CRITICAL,
     `WAGE_GARNISHMENT_DETECTED` HIGH.
   - Wire into the per-report loop in `generateAlerts` (after the
     `_generateComplianceAlerts` push, line ~56):
     `alerts.push(...this._generateGarnishmentAlerts(finsightReport, index));`
3. Tests: new `tests/unit/garnishmentAlerts.test.js` — one fixture per code
   (e.g. "CA SDU CHILD SUPPORT" -> CHILD_SUPPORT_GARNISHMENT, "IRS LEVY" -> TAX_LEVY_DETECTED,
   "LEGAL ORDER DEBIT" -> WAGE_GARNISHMENT_DETECTED), one negative fixture
   ("PAYROLL ACH" deposit must NOT flag; inflows never flag), and a schema test that a
   Statement alert with each new code passes mongoose validation.

## F3. Persist warnings to envelope201 (P3.9 + P3.10)

`src/controllers/statementController.js`: `analysis.envelope201` is saved via
`findByIdAndUpdate` at ~line 5994, but `businessStatus` / `diagnosticSummaries` /
`analysisQuality` are attached to the envelope object at ~line 6043 — AFTER the save.
A page reload therefore loses the warnings panel data.

Fix: move the attachment block so those fields are on the envelope BEFORE the
`findByIdAndUpdate` persist (or issue a second update after attachment — prefer the move).
Verify the anchors first with: `rg -n "businessStatus|diagnosticSummaries|envelope201" src/controllers/statementController.js`.
`GET /api/statements/:id` already returns `analysis.envelope201` verbatim, so persistence
automatically exposes the warnings — no route change needed.

Test: unit/integration test asserting the saved doc's `analysis.envelope201.businessStatus`
equals `COMPLETED_WITH_WARNINGS` when diagnostic summaries exist.

## F4. Sync-201 warnings redirect (P3.11)

`public/js/upload-hub.js`, `redirectToResultsAfter201` (~line 888): it never checks
`businessStatus`; only the async poll path passes `{ warnings: true }`.

Fix:
- In `redirectToResultsAfter201`, check `json.businessStatus === 'COMPLETED_WITH_WARNINGS'`
  and pass `{ warnings: true }` into the redirect helper (same option the async path uses).
- Cache `macroDiagnosticSummaries` into sessionStorage on the sync path exactly like the
  async poll path does (search for where the async path writes it and mirror).

## F5. Warnings panel API fallback + field mapping (P3.12)

`public/js/helios-results-bootstrap.js`: the warnings panel reads only from sessionStorage.

Fix:
- When URL has `warnings=1` and the sessionStorage payload is empty/missing, fetch
  `GET /api/statements/:id` (statement id is available in the page query/session) and read
  `analysis.envelope201.diagnosticSummaries`.
- Render the `diagnosis` and `explanation` fields of each summary explicitly (currently
  only partially mapped). Keep sessionStorage as the primary source; API is fallback only.

## F6. Warnings redirect owner decision (P3.13)

`public/js/upload-hub.js` (`resultsDashboardUrl` / `dashboardBaseUrl` routing):
default redirect targets `http://localhost:3002` (Next.js dashboard) which has no
warnings panel.

Fix (one-liner class): when `businessStatus` is `COMPLETED_WITH_WARNINGS`, route to
`manual-results.html` (which hosts the warnings panel via `helios-results-bootstrap.js`);
keep the Next.js dashboard for clean completions.

## Exit criteria (fast tier)

- Full unit suite green: `npx vitest run --config vitest.unit.config.js`
- Manual round-trip: upload a statement that produces warnings; after the 201 response
  (sync AND async paths) the browser lands on `manual-results.html?...&warnings=1` and the
  panel renders diagnosis/explanation rows even after a hard page reload.
