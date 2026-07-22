import { describe, it, expect } from 'vitest';
import {
  attachParseOutcomeFlags,
  summarizeBatchParseOutcomes,
  enrichChecksumWithPrintedActivity,
  applyLineHintSigns,
  applyParseQualityPipeline
} from '../../src/utils/statementParseQuality.js';

describe('statementParseQuality best-effort', () => {
  it('returns 200 suggestedHttpStatus when checksum fails but txns exist', () => {
    const stmt = {
      transactions: [{ amount: 100 }],
      checksumRecon: { ok: false },
      parseQuality: 'FAILED_CHECKSUM'
    };
    const outcome = attachParseOutcomeFlags(stmt);
    expect(outcome.status).toBe('checksum_failed');
    expect(outcome.suggestedHttpStatus).toBe(200);
    expect(outcome.txnCount).toBe(1);
  });

  it('returns 422 only when txnCount is zero', () => {
    const stmt = {
      transactions: [],
      checksumRecon: { ok: false },
      parseQuality: 'FAILED_CHECKSUM'
    };
    const outcome = attachParseOutcomeFlags(stmt);
    expect(outcome.status).toBe('no_transactions');
    expect(outcome.suggestedHttpStatus).toBe(422);
  });

  it('summarizeBatchParseOutcomes uses 200 for checksum drift with rows', () => {
    const batch = summarizeBatchParseOutcomes([
      {
        transactions: [{ amount: 50 }],
        checksumRecon: { ok: false },
        parseQuality: 'FAILED_CHECKSUM'
      }
    ]);
    expect(batch.httpStatus).toBe(200);
    expect(batch.primaryReason).toBe('checksum_failed');
  });

  it('Jan Capri success criteria: ISO plumber rows map to Chase ledger (outCount > 0)', () => {
    const capriStyleRows = [
      {
        date: '2025-01-02',
        dateRaw: '01/02',
        description: 'Zelle Payment From Vendor',
        amount: 762.06,
        type: 'CREDIT',
        section: 'deposits'
      },
      {
        date: '2025-01-03',
        dateRaw: '01/03',
        description: 'Check 1001',
        amount: 500,
        type: 'DEBIT',
        section: 'checks'
      }
    ];
    const batch = summarizeBatchParseOutcomes([
      {
        transactions: capriStyleRows,
        checksumRecon: { ok: false },
        parseQuality: 'FAILED_CHECKSUM'
      }
    ]);
    expect(batch.httpStatus).toBe(200);
    expect(capriStyleRows.length).toBeGreaterThan(0);
  });
});

describe('printed-activity tolerance floor (max $1, 1%)', () => {
  const ok = { ok: true };
  const run = (parsedDep, printedDep) =>
    enrichChecksumWithPrintedActivity(
      ok,
      { printedDeposits: printedDep },
      [{ amount: parsedDep, type: 'credit' }]
    );

  it('passes a $0.99 miss on small activity where 1% alone would fail', () => {
    // 1% of $50 is $0.50; the $1 floor must carry this.
    const r = run(50.99, 50);
    expect(r.depositsMatch).toBe(true);
    expect(r.ok).toBe(true);
  });

  it('passes exactly at the $1.00 floor boundary', () => {
    const r = run(51, 50);
    expect(r.depositsMatch).toBe(true);
  });

  it('fails just past the $1.00 floor on small activity', () => {
    const r = run(51.01, 50);
    expect(r.depositsMatch).toBe(false);
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/printed deposits drift/);
  });

  it('uses 1% relative on large activity (floor is dominated)', () => {
    // 1% of $10,000 = $100 tolerance
    expect(run(10099, 10000).depositsMatch).toBe(true);
    expect(run(10101, 10000).depositsMatch).toBe(false);
  });

  it('applies the same floor to withdrawals', () => {
    const r = enrichChecksumWithPrintedActivity(
      ok,
      { printedWithdrawals: 200 },
      [{ amount: -200.75, type: 'debit' }]
    );
    expect(r.withdrawalsMatch).toBe(true);
  });
});

describe('applyLineHintSigns profile-signed rows', () => {
  it('does not flip amounts on section-tagged profile rows', () => {
    const rows = [
      {
        amount: 125,
        description: 'ACH deposit',
        section: 'deposits',
        rawLine: '01/15 ACH deposit 125.00'
      },
      {
        amount: -500,
        description: 'Check 1001',
        sectionLabel: 'checks',
        extractionSource: 'regions_business_checking',
        rawLine: '01/16 Check 1001 500.00'
      }
    ];
    const out = applyLineHintSigns(rows);
    expect(out[0].amount).toBe(125);
    expect(out[1].amount).toBe(-500);
  });
});

describe('applyParseQualityPipeline spec profile reconciliation', () => {
  it('uses profileReconciliation printed totals for spec-aware checksum', () => {
    const parsed = {
      fileName: 'regions-test.pdf',
      openingBalance: 1000,
      closingBalance: 1300,
      transactions: [
        { amount: 500, type: 'credit', section: 'deposits' },
        { amount: -200, type: 'debit', section: 'withdrawals' }
      ],
      parseResult: {
        metadata: {
          profileReconciliation: {
            openingBalance: 1000,
            closingBalance: 1300,
            printedDeposits: 500,
            printedWithdrawals: 200,
            printedLines: { deposits: 500, withdrawals: 200 },
            reconciliationSpec: {
              summaryLines: [
                { key: 'deposits', role: 'credit' },
                { key: 'withdrawals', role: 'debit' }
              ]
            }
          }
        }
      }
    };
    const { checksumRecon, parseQuality } = applyParseQualityPipeline(parsed);
    expect(parseQuality).toBe('OK');
    expect(checksumRecon.ok).toBe(true);
    expect(checksumRecon.depositsMatch).toBe(true);
    expect(checksumRecon.withdrawalsMatch).toBe(true);
  });
});
