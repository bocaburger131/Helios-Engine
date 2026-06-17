# LayoutLearningAgent — Hot Path Audit

## Summary
- Layout teach path (Gemini vision → template persist → re-parse) is integrated in `batchParseOrchestrator` with RTN-scoped cache eviction.
- Gemini service has JSON repair retry and `GEMINI_VISION_MIN_INTERVAL_MS` rate spacing.
- Shadow comparator results reach dashboard but promotion criteria are not obvious to users.

## Files reviewed
- `bank-statement-analyzer-api/src/services/coldStartLayoutService.js`
- `bank-statement-analyzer-api/src/services/geminiVisionService.js`
- `bank-statement-analyzer-api/src/services/llm/aiLayoutService.js`
- `bank-statement-analyzer-api/src/services/templateGraduationService.js`
- `bank-statement-analyzer-api/src/services/extraction/layoutPipeline/layoutFirstOrchestrator.js`
- `bank-statement-analyzer-api/src/services/extraction/layoutPipeline/pipelineShadowComparator.js`
- `bank-statement-analyzer-api/src/services/visionLayoutCacheService.js`

## Findings

| Severity | Category | File:line | Issue | Context7 alignment? |
|----------|----------|-----------|-------|---------------------|
| P1 | Reliability | `geminiVisionService.js` | Uses deprecated `@google/generative-ai` SDK path; structured output via `responseMimeType`/`responseSchema` should be verified on current model | Yes — JSON schema |
| P2 | Cost | `batchParseOrchestrator.js:846,873,1224` | Cache clear on teach is good; no per-batch Gemini call budget cap | No |
| P2 | UX | `pipelineShadowComparator.js` | Shadow panel shows technical deltas; users cannot tell if layout-first should be trusted | No |
| P2 | Data | `templateGraduationService.js` | VERIFIED requires 5 consecutive passes — cold-start may show LEARNING for many uploads | No |
| P3 | Framework | `geminiVisionService.js:290` | `GEMINI_VISION_MIN_INTERVAL_MS` env knob exists — document in `.env.example` | No |

## Enhancements (ranked P0–P2)

| Rank | Item | Effort |
|------|------|--------|
| P1-1 | Enforce `responseSchema` on layout teach JSON where model supports it | M |
| P2-1 | Dashboard shadow panel: one-line "layout-first wins" recommendation | S |
| P2-2 | Log Gemini token/call count per batch correlationId | S |
| P2-3 | Document `GEMINI_VISION_MIN_INTERVAL_MS` in `.env.example` | S |

## Suggested tests
- `coldStartLayoutService.test.js` — extend for cache eviction callback
- Mock Gemini schema validation failure → repair path
- Shadow comparator integration with checksum pass/fail matrix

## Context7 sources used
- `/google-gemini/deprecated-generative-ai-js` — `responseMimeType`, `responseSchema` for structured layout JSON
