# BatchOrchestratorAgent — Hot Path Audit

## Summary
- Upload → macro path is solid: triage session, BullMQ worker, progress polling, and demo layout-learning gate are wired end-to-end.
- BullMQ worker lacks **stalled-job monitoring** recommended by Context7; long macro jobs risk silent double-processing.
- Dashboard batch client treats any non-201/202-with-jobId as generic failure — institution gate 202 responses need richer UX.

## Files reviewed
- `bank-statement-analyzer-api/src/services/batchParseOrchestrator.js`
- `bank-statement-analyzer-api/src/services/statementBatchPipelineService.js`
- `bank-statement-analyzer-api/src/services/triageSessionService.js`
- `bank-statement-analyzer-api/src/services/batchProgressStore.js`
- `bank-statement-analyzer-api/src/services/institutionProfileGateService.js`
- `bank-statement-analyzer-api/src/workers/statementProcessingWorker.js`
- `helios-dashboard/src/lib/batchUploadClient.ts`
- `helios-dashboard/src/components/upload/UploadHubPage.tsx`

## Findings

| Severity | Category | File:line | Issue | Context7 alignment? |
|----------|----------|-----------|-------|---------------------|
| P1 | Reliability | `statementProcessingWorker.js:43-82` | No `worker.on('stalled')` handler; BullMQ docs warn stalled jobs may double-process | Yes — idempotent jobs + stalled logging |
| P1 | UX | `UploadHubPage.tsx:195-209` | `202` without `jobId` (gate block) surfaces as generic "Batch failed" | No |
| P2 | Reliability | `batchUploadClient.ts:222-256` | 30-minute poll timeout throws with no partial result / correlationId in message | No |
| P2 | Reliability | `UploadHubPage.tsx:154-170` | Triage debounce via `triageGen` is correct but `setBusy(false)` only on matching gen — rapid file churn can flash busy state | No |
| P2 | Maintainability | `batchParseOrchestrator.js` (~1.2k LOC) | Orchestrator mixes teach, re-parse, vision fallback, checksum recovery | No |
| P3 | Framework | `statementProcessingWorker.js:61-62` | `lockDuration: 300_000` / `lockRenewTime: 120_000` reasonable for macro; document if Gemini teach exceeds 5m CPU block | Yes |

## Enhancements (ranked P0–P2)

| Rank | Item | Effort |
|------|------|--------|
| P1-1 | Add `stalled` + structured log on statement worker | S |
| P1-2 | Parse `INSTITUTION_PROFILE_STEP1_REQUIRED` in batch client; show gate recommendation in Upload Hub | S |
| P2-1 | Include `correlationId` in poll timeout error | S |
| P2-2 | Extract batch HTTP status handling into `parseBatchResponse()` unit test | S |

## Suggested tests
- Unit: `parseBatchResponse` for 201, 202+jobId, 202 gate block, 500
- Integration: worker stalled event logs (mock Worker)
- E2E: upload 3-pack → poll completes → dashboard redirect

## Context7 sources used
- `/taskforcesh/bullmq` — idempotent jobs, stalled checker, at-least-once semantics
