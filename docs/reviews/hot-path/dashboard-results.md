# DashboardResultsAgent — Hot Path Audit

## Summary
- SSR uses `cache: "no-store"` on statement fetch — correct for fresh macro data per Context7.
- `DashboardClientLoader` recovers from SSR failure via client refetch but error from SSR is not passed through.
- `ForensicChart` already labels estimated data when checksum fails; `analysisAdapter.ts` is the critical truth layer (~850 LOC).

## Files reviewed
- `helios-dashboard/src/app/(helios)/dashboard/[id]/page.tsx`
- `helios-dashboard/src/components/DashboardClientLoader.tsx`
- `helios-dashboard/src/components/UnderwritingDashboard.tsx`
- `helios-dashboard/src/lib/analysisAdapter.ts`
- `helios-dashboard/src/lib/envelopeAdapter.ts`
- `helios-dashboard/src/components/charts/ForensicChart.tsx`
- `helios-dashboard/src/components/results/VeraFloatingDock.tsx`
- `helios-dashboard/src/lib/veraChatClient.ts`

## Findings

| Severity | Category | File:line | Issue | Context7 alignment? |
|----------|----------|-----------|-------|---------------------|
| P0 | Data | `envelopeAdapter.ts` + `analysisAdapter.ts:743` | Metrics can show "Strong" when checksum failed and txns empty | No |
| P1 | UX | `dashboard/[id]/page.tsx:55-61` | SSR catch swallows error — client refetches without SSR error context | Yes — explicit error UI |
| P1 | Tests | `src/lib/*.test.ts` | No component tests for dashboard or ForensicChart | Yes — Vitest component testing |
| P2 | Maintainability | `analysisAdapter.ts` | God-module — chart, checksum, integrity, formatting combined | No |
| P2 | UX | `VeraFloatingDock.tsx` | Collapsed dock hidden when no `decision` — chat-only users see nothing until expand affordance added | No |
| P3 | Framework | `ForensicChart.tsx:109-131` | Estimated data banner present — good | Yes — Recharts ResponsiveContainer |

## Enhancements (ranked P0–P2)

| Rank | Item | Effort |
|------|------|--------|
| P0-1 | `buildEnvelopeViewModel`: set `degraded` / cap Veritas when checksum pass rate < 1 | M |
| P1-1 | Pass `serverFetchError` from page.tsx to DashboardClientLoader | S |
| P1-2 | VeraFloatingDock: show chat pill even when `decision` is null | S |
| P2-1 | Split `analysisAdapter.ts` into `checksumAdapter.ts` + `chartAdapter.ts` | M |
| P2-2 | Add `ForensicChart.test.tsx` smoke test with fixture | M |

## Suggested tests
- Extend `parseIntegrity.test.ts` for degraded envelope view model
- `veraChatClient.test.ts` — add `sendVeraChatMessage` mock fetch test
- SSR error propagation test (page unit with mocked fetch)

## Context7 sources used
- `/vercel/next.js/v16.2.2` — `cache: 'no-store'`, Server Component error handling
- `/recharts/recharts` — ResponsiveContainer SSR static dimensions
