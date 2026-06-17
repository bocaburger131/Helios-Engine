# StatementApiAgent — Hot Path Audit

## Summary
- Batch triage/macro and Vera chat live in `statementController.js` (~7.5k LOC) — hot sections are functional but hard to maintain.
- Demo mode correctly bypasses production gate block; public upload routes are guarded by middleware.
- Chat endpoint now returns both `answer` and `response` (recent fix).

## Files reviewed
- `bank-statement-analyzer-api/src/controllers/statementController.js` (batch ~4800–5900, chat ~3211)
- `bank-statement-analyzer-api/src/routes/statementRoutes.js`
- `bank-statement-analyzer-api/src/utils/macroResponseEnvelope.js`
- `bank-statement-analyzer-api/src/utils/macroAnalytics.js`
- `bank-statement-analyzer-api/src/config/appMode.js`
- `bank-statement-analyzer-api/src/middleware/auth.js`

## Findings

| Severity | Category | File:line | Issue | Context7 alignment? |
|----------|----------|-----------|-------|---------------------|
| P1 | Maintainability | `statementController.js` | God controller — batch/macro/chat/triage intertwined | No |
| P1 | Security | `auth.js` + `appMode.js` | `DISABLE_AUTH` bypass must never ship in production — boot guard exists | Yes — fail closed |
| P2 | Contract | `statementController.js:3417-3422` | Chat returns `answer` + `response` — other endpoints may have similar field aliases | No |
| P2 | Contract | `macroResponseEnvelope.js` | Dashboard assumes nested `data.statement` shape — drift breaks SSR | No |
| P2 | UX | `statementController.js:4837-4849` | 202 gate response includes `institutionProfileGate` — client does not parse it | No |
| P3 | Framework | `statementRoutes.js` | Public upload routes behind `requirePublicUploadAllowed` + rate limit — good | Yes |

## Enhancements (ranked P0–P2)

| Rank | Item | Effort |
|------|------|--------|
| P1-1 | Extract `buildBatchMacroResponse()` to `statementController.services.js` | M |
| P1-2 | Typed error code `INSTITUTION_PROFILE_STEP1_REQUIRED` in batch client | S |
| P2-1 | OpenAPI/contract test for macro envelope required fields | M |
| P2-2 | Audit all Vera/AI endpoints for `answer`/`response` parity | S |

## Suggested tests
- Integration: batch 202 gate in production mode without `allowProbeAnalysis`
- Integration: demo mode never 202-blocks
- Contract: macro envelope snapshot test

## Context7 sources used
- `/vercel/next.js/v16.2.2` — server fetch error handling patterns (consumer side)
