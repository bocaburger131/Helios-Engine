# ExtractionParseAgent — Hot Path Audit

## Summary
- Profile registry + Chase Capri fixes (detect 0.86, multi-section `*start*` markers, withdrawal total sum) address recent checksum failures.
- `pdfParserService.js` remains the highest-risk file (~2.5k LOC) on the hot path.
- Parse quality flags reach the dashboard but optimistic metrics can still render when checksum fails and transactions are empty.

## Files reviewed
- `bank-statement-analyzer-api/src/services/pdfParserService.js` (structure + hot paths)
- `bank-statement-analyzer-api/src/services/extraction/bankProfileRegistry.js`
- `bank-statement-analyzer-api/src/services/extraction/profiles/chaseBusinessCompleteProfile.js`
- `bank-statement-analyzer-api/src/services/extraction/statementExtractionPipeline.js`
- `bank-statement-analyzer-api/src/services/extraction/statementReconciliation.js`
- `bank-statement-analyzer-api/src/utils/parseOneStatementPdfForBatch.js`
- `bank-statement-analyzer-api/src/utils/statementParseQuality.js`

## Findings

| Severity | Category | File:line | Issue | Context7 alignment? |
|----------|----------|-----------|-------|---------------------|
| P0 | Data | `analysisAdapter.ts` (consumer) | When `checksumOk=false` and `transactions=[]`, hero metrics can still use summary rollups (Premier Fitness pattern) | No |
| P1 | Data | `bankProfileRegistry.js:175-180` | Profiles below 0.8 threshold fall to `generic_digital` — bankName boost helps Chase but other RTN-only banks may miss | No |
| P1 | Reliability | `pdfParserService.js` | Monolithic orchestrator — hard to reason about dual-engine vs profile vs layout ordering | No |
| P2 | Data | `chaseBusinessCompleteProfile.js` | Recent `sumChasePrintedWithdrawalTotals` fix — ensure `extractChasePrintedFromDocument` stays aligned | No |
| P2 | Tests | `tests/unit/chaseBusinessCompleteProfile.test.js` | Capri fixtures added; no PDF binary golden for real Jan/Feb/March files | No |
| P2 | Maintainability | `statementParseQuality.js` | Quality flags rich but not all surfaced in dashboard parse-quality table | No |

## Enhancements (ranked P0–P2)

| Rank | Item | Effort |
|------|------|--------|
| P0-1 | Gate `envelopeAdapter` / hero metrics when `effectiveChecksumOk` false — show degraded state consistently | M |
| P1-1 | Log resolved profile + confidence on every batch parse (already in registry — ensure batch path passes `bankName`) | S |
| P1-2 | Split `pdfParserService` entry into `parseStatementCore` thin wrapper (no behavior change) | M |
| P2-1 | Add anonymized Capri snippet fixtures from live run to unit tests | M |

## Suggested tests
- Extend `parseIntegrity.test.ts` with checksum-failed + empty txn fixture
- Chase Capri 3-pack regression in API unit tests (text fixtures)
- Profile resolution test with RTN-only input (no bankName)

## Context7 sources used
- `/vitest-dev/vitest` — fixture and mock patterns (for recommended test additions)
