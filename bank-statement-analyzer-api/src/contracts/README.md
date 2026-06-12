# Project Vera — API contracts

Static JSON mocks define the **201 macro-batch response envelope** and downstream service shapes. Role 1 builds against these files when `USE_MOCK_SERVICES=true` (default until Vera + Junior Underwriter engines ship).

## Files

| File | Purpose |
|------|---------|
| `mocks/mockAccountingSummary.json` | P&L roll-up: revenue, COGS, OpEx, debt service |
| `mocks/mockJuniorUnderwriterReport.json` | 5 C's scorecard + overall decision |
| `mocks/mockVeraBriefing.json` | Vera decision, stipulations, briefing markdown |
| `mocks/mock201Envelope.json` | Full `POST /api/statements/batch` 201 payload |
| `mocks/mockTriageSessionMeta.json` | Triage manifest `meta` shape after application PDF extraction |

## Runtime

- `USE_MOCK_SERVICES=true` — envelope uses mock Vera / jrUW / accountingSummary; macro analysis still runs unless fully mocked.
- `USE_MOCK_SERVICES=false` — envelope uses live engine outputs when present.
- `USE_VERA_BRIEFING_V2=true` — Phase 7 calls `veraBriefingService` (Gemini 2.5 Pro `responseSchema`); on failure, falls back to Perplexity `VeraReportService`.

## Loader

```js
import { loadContractMocks, useMockServices } from './loadContractMocks.js';
```

## Envelope builder

```js
import { buildMacroResponseEnvelope } from '../services/macroResponseEnvelope.js';
```

Services must read deal context from `macroResult.applicationData` only — not independent Redis fetches.
