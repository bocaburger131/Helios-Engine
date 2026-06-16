import { describe, it, expect } from 'vitest';
import {
  attachParseOutcomeFlags,
  summarizeBatchParseOutcomes
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

  it('summarizeBatchParseOutcomes handles mixed outcomes with no transactions', () => {
    const batch = summarizeBatchParseOutcomes([
      {
        transactions: [{ amount: 50 }],
        checksumRecon: { ok: false },
        parseQuality: 'FAILED_CHECKSUM'
      },
      {
        transactions: [],
        checksumRecon: { ok: false },
        parseQuality: 'FAILED_CHECKSUM'
      }
    ]);
    expect(batch.httpStatus).toBe(422); // Because one of them has no transactions
    expect(batch.primaryReason).toBe('no_transactions');
  });
});
