# Hot-Path Review SYNTHESIS

**Date:** 2026-06-16  
**Scope:** Upload → triage → batch → parse → macro → dashboard → Vera  
**Agents:** 6 domain audits + Context7 prefetch  
**Test run:** see [Test Results](#test-results) below

---

## Cross-cutting themes

1. **Trust vs checksum** — Dashboard can show optimistic hero metrics when `checksumOk=false` and transactions are empty (Premier Fitness / Maas Treats pattern).
2. **Envelope drift** — API macro shape is rich; dashboard adapters are the single truth layer but not consistently degraded.
3. **Demo pipeline** — Layout learning gate and `allowProbeAnalysis` are aligned; client still needs better 202 gate error parsing.
4. **BullMQ at-least-once** — Worker has lock tuning but no stalled monitoring per Context7 guidance.
5. **God modules** — `statementController.js`, `pdfParserService.js`, `analysisAdapter.ts` concentrate hot-path risk.

---

## Top 10 enhancements (Phase C backlog)

| # | Priority | Enhancement | Effort | Owner domain | Test plan |
|---|----------|-------------|--------|--------------|-----------|
| 1 | P0 | Degrade Veritas/hero metrics when checksum pass rate < 100% or no txn-level data | M | dashboard-results | `parseIntegrity.test.ts` |
| 2 | P1 | Add BullMQ `stalled` event logging on statement worker | S | batch-orchestrator | unit mock / manual |
| 3 | P1 | `formatBatchError()` — parse gate 202 + `INSTITUTION_PROFILE_STEP1_REQUIRED` | S | dashboard-upload | `batchUploadClient.test.ts` |
| 4 | P1 | Pass SSR fetch error to `DashboardClientLoader` | S | dashboard-results | manual / page test |
| 5 | P1 | VeraFloatingDock chat pill when `decision` is null | S | dashboard-results | visual |
| 6 | P2 | Poll timeout error includes `correlationId` | S | batch-orchestrator | unit |
| 7 | P2 | Shadow panel one-line layout-first recommendation | S | layout-learning | manual |
| 8 | P2 | Extract `buildBatchMacroResponse` slice from statementController | M | statement-api | integration |
| 9 | P2 | Document `GEMINI_VISION_MIN_INTERVAL_MS` in `.env.example` | S | layout-learning | n/a |
| 10 | P2 | `sendVeraChatMessage` mock fetch unit test | S | dashboard-results | vitest |

**Phase C implementation (this session):** #2, #3, #4, #5, #6, #1 (partial — envelope degraded badge)

---

## Deduplicated findings (by severity)

### P0
| Issue | Files |
|-------|-------|
| Optimistic metrics when checksum failed + empty transactions | `envelopeAdapter.ts`, `analysisAdapter.ts`, `UnderwritingDashboard.tsx` |

### P1
| Issue | Files |
|-------|-------|
| No BullMQ stalled handler | `statementProcessingWorker.js` |
| Batch 202 gate errors opaque in UI | `UploadHubPage.tsx`, `batchUploadClient.ts` |
| SSR error swallowed | `dashboard/[id]/page.tsx` |
| No component tests on hot path | `helios-dashboard/src/` |
| `statementController.js` size | `statementController.js` |

### P2
| Issue | Files |
|-------|-------|
| Poll timeout lacks correlationId | `batchUploadClient.ts` |
| `analysisAdapter.ts` god-module | `analysisAdapter.ts` |
| Gemini structured schema adoption | `geminiVisionService.js` |
| Profile fallback to generic_digital | `bankProfileRegistry.js` |

---

## Test gap matrix

| Area | Unit | Integration | Component/E2E |
|------|------|-------------|-----------------|
| Batch orchestrator | `batchParseOrchestrator.test.js` | partial | **missing** upload→poll |
| Chase parse | `chaseBusinessCompleteProfile.test.js` | partial | **missing** PDF binary |
| Institution gate | `institutionProfileGate.probe.test.js` | partial | **missing** |
| Cold start layout | `coldStartLayoutService.test.js` | partial | **missing** |
| Dashboard adapters | 6 vitest files | **missing** | **missing** |
| Vera chat client | `veraChatClient.test.ts` (extract only) | **missing** | **missing** |
| BullMQ worker | **missing** | **missing** | **missing** |

---

## Test results

| Suite | Result |
|-------|--------|
| API hot-path (`batchParseOrchestrator`, `chaseBusinessCompleteProfile`, `institutionProfileGate.probe`, `coldStartLayoutService`) | **40/40 passed** |
| Dashboard vitest (incl. new `batchUploadClient.test.ts`) | **26/26 passed** |

MongoMemoryServer warning on Windows is non-blocking for these unit tests.

## Phase C implemented (this session)

| # | Enhancement | Status |
|---|-------------|--------|
| 1 | Degrade Veritas badge / bankability when parse untrusted | Done — `envelopeAdapter.ts` |
| 2 | BullMQ `stalled` event logging | Done — `statementProcessingWorker.js` |
| 3 | `formatBatchError()` for gate 202 | Done — `batchUploadClient.ts` + Upload Hub |
| 4 | SSR fetch error passed to client loader | Done — `page.tsx` + `DashboardClientLoader.tsx` |
| 5 | Vera dock chat pill without decision | Done — `VeraFloatingDock.tsx` |
| 6 | Poll timeout includes correlationId | Done — `batchUploadClient.ts` |

## Context7 libraries referenced

| Library ID | Used for |
|------------|----------|
| `/taskforcesh/bullmq` | Stalled jobs, idempotency |
| `/vercel/next.js/v16.2.2` | SSR fetch, `no-store`, error handling |
| `/recharts/recharts` | ResponsiveContainer, ComposedChart |
| `/google-gemini/deprecated-generative-ai-js` | Structured JSON output |
| `/vitest-dev/vitest` | Test patterns |

---

## Agent reports

- [batch-orchestrator.md](./batch-orchestrator.md)
- [extraction-parse.md](./extraction-parse.md)
- [layout-learning.md](./layout-learning.md)
- [statement-api.md](./statement-api.md)
- [dashboard-upload.md](./dashboard-upload.md)
- [dashboard-results.md](./dashboard-results.md)
