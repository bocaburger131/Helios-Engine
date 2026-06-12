# Verifying `GET /api/statements/:id` (macro totals, NSF, coverage)

Use an authenticated request with `Authorization: Bearer <token>`.

## Response shape

- `data.statement` — full MongoDB statement plus `coveragePeriod`, `monthlyStatementSummaries`, `statementFiles`, `statementCount` from macro aggregation when applicable.
- `data.transactions` — persisted transactions for that statement (may be empty for macro-only flows).

## Checklist

1. **Credits / debits vs Helios**  
   For macro analyses, `analytics.totalDeposits` and `analytics.totalWithdrawals` should match the sum of `analysis.accountGroups[].heliosAnalysis.financialSummary.{totalDeposits,totalWithdrawals}` (within cent rounding).

2. **NSF alignment**  
   Compare `analytics.nsfCount` / `summary.nsfCount` with each group’s `heliosAnalysis.nsfAnalysis.nsfCount`. After the Helios pipeline change, NSF counts are derived from the same balance-inferred transaction array as financial totals.

3. **Coverage**  
   `monthlyStatementSummaries[].coveragePeriod` should be `{ startDate, endDate, daysCovered }` (ISO `YYYY-MM-DD`) when parser or transaction fallbacks succeed. List endpoints expose the same shape on `coveragePeriod`.

4. **Master JSON export**  
   `GET /api/statements/:id/export-json` returns the same JSON payload as `GET /api/statements/:id` with `Content-Disposition: attachment` for archival downloads.

5. **Reconciliation alert**  
   When statement opening/closing balances disagree with computed flows beyond tolerance, macro group alerts may include `RECONCILIATION_MISMATCH`.
