# Cold-start bank onboarding runbook

Use this checklist after uploading an unknown bank statement pack.

## 1. Upload (probe mode)

1. Open Upload Hub and stage PDFs.
2. Confirm triage shows **Step 1 required** for the institution.
3. Leave **Run probe analysis** checked (sends `allowProbeAnalysis=true`).
4. Ensure `GEMINI_API_KEY` or `GOOGLE_API_KEY` is set for layout learning.
5. Run analysis and open the dashboard report.

## 2. Verify layout + checksum

In **View JSON**:

- `analysis.metadata.layoutDiscoveryByFile[].hasDocumentMap` → `true`
- `analysis.metadata.institutionProfileGate.layoutDiscoveryStatus` → `complete`
- Monthly rows: `checksumOk: true` and `reconciliation.checksumOk: true` when possible

**Document Provenance** panel should list regions: `summary`, `transactionHistory`, `fee_ledger`, `identity`.

## 3. Verify transaction charts

- `analysis.chartActivity.daily.length` > 0 **or** `data.transactions.length` > 0
- Switch chart to **Daily** / **Liquidity** and drill into a month — balances should render

## 4. Scaffold Tier-1 profile (developer)

After first successful cold-start learn:

```bash
cd bank-statement-analyzer-api

# From exported template JSON (View JSON → InstitutionalProfile templates)
node scripts/scaffold-institution-profile.mjs \
  --rtn <9-digit-rtn> \
  --slug <bank_slug> \
  --name "Bank Name" \
  --from-template-json ./tmp/learned-template.json

# Or from Mongo InstitutionalProfile _id
node scripts/scaffold-institution-profile.mjs \
  --rtn <rtn> --slug <slug> --name "Bank Name" \
  --from-template <institutionalProfileId>
```

Then manually:

1. Register profile in `src/services/extraction/bankProfileRegistry.js`
2. Add RTN to `src/config/bankIdentifiers.js`
3. Add reconciliation spec lines printed by scaffold
4. Add layout hooks in `profileLayoutHooks.js`
5. Commit golden PDF fixture + unit test

## 5. Template graduation → VERIFIED

Re-upload the same bank until **5 consecutive checksum passes** increment `consecutiveSuccesses` on the LEARNING template (`templateGraduationService`).

Upload Hub banner should show `profileStatus: VERIFIED` and `productionReady: true`.

## 6. Vera

- **Briefing** renders on results page
- **Ask Vera** chat panel calls `POST /api/statements/analysis/chat`

## Troubleshooting

| Symptom | Action |
|---------|--------|
| 202 `INSTITUTION_PROFILE_STEP1_REQUIRED` | Enable probe checkbox or set `INSTITUTION_PROFILE_PROBE_DEFAULT=true` |
| No layout map | Check Gemini API key; review API logs for `[BATCH_ORCHESTRATOR]` / `[COLD_START]` |
| Checksum fail | Re-run after layout teach; export template and scaffold reconciliation spec |
| Empty daily chart | Re-upload after chartActivity fix; confirm `transactionPersist.persisted` > 0 |
