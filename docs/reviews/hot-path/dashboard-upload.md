# DashboardUploadAgent — Hot Path Audit

## Summary
- Upload Hub flow is clear: debounced triage → batch → poll → redirect with token.
- Layout learning banner (blue) replaced probe checkbox — aligned with demo pipeline.
- `DealContext` hydrates from triage anchors but is not passed to batch `applicationData` on every path consistently.

## Files reviewed
- `helios-dashboard/src/components/upload/UploadHubPage.tsx`
- `helios-dashboard/src/components/BatchProgressPanel.tsx`
- `helios-dashboard/src/lib/apiClient.ts`
- `helios-dashboard/src/components/shell/DealContext.tsx`
- `helios-dashboard/src/lib/batchUploadClient.ts`

## Findings

| Severity | Category | File:line | Issue | Context7 alignment? |
|----------|----------|-----------|-------|---------------------|
| P1 | UX | `UploadHubPage.tsx:208-209` | Gate-block 202 messages not parsed from `institutionProfileGate.recommendation` | No |
| P2 | Reliability | `UploadHubPage.tsx:154-170` | Auto-triage on file drop uses generation guard — good; no abort on unmount | No |
| P2 | Contract | `batchUploadClient.ts:112-122` | `allowProbeAnalysis` auto-appended in dev — correct for demo | No |
| P2 | Security | `apiClient.ts:16-19` | Token in `localStorage` — acceptable for demo; document LIVE mode expectations | No |
| P3 | UX | `BatchProgressPanel.tsx` | Phase labels adequate; no ETA from `batchProgressStore` fields | No |

## Enhancements (ranked P0–P2)

| Rank | Item | Effort |
|------|------|--------|
| P1-1 | `formatBatchError(json)` helper for gate + bank confirmation errors | S |
| P2-1 | Pass `companyName` from DealContext on batch if user edits after triage | S |
| P2-2 | AbortController on triage fetch when component unmounts | S |

## Suggested tests
- Unit: `formatBatchError` for gate JSON
- Component: UploadHub primary button disabled states (optional — no component tests today)

## Context7 sources used
- `/vercel/next.js/v16.2.2` — client component patterns, form upload
