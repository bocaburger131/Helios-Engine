import { describe, it, expect, vi, beforeEach } from 'vitest';

// Controls whether the mocked pipeline reports the checksum as reconciled.
const pipelineState = { reconcileAfterFlip: true };

const { applyParseQualityPipeline, attachChecksumDeltaProbe } = vi.hoisted(() => ({
  applyParseQualityPipeline: vi.fn(),
  attachChecksumDeltaProbe: vi.fn()
}));

vi.mock('../../src/utils/statementParseQuality.js', () => ({
  applyParseQualityPipeline,
  attachChecksumDeltaProbe
}));

import {
  flipCreditDebitRows,
  applyDiagnosticCorrection,
  resolveAutoCorrectMinConfidence
} from '../../src/utils/checksumAutoCorrection.js';

describe('flipCreditDebitRows', () => {
  it('negates targeted rows and re-labels type', () => {
    const rows = [
      { amount: 500, type: 'DEBIT' },
      { amount: -200, type: 'DEBIT' }
    ];
    const out = flipCreditDebitRows(rows, [0]);
    expect(out[0].amount).toBe(-500);
    expect(out[0].type).toBe('DEBIT');
    expect(out[1].amount).toBe(-200); // untouched
  });

  it('flips all rows when affectedRows is empty', () => {
    const out = flipCreditDebitRows([{ amount: 100, type: 'DEBIT' }, { amount: 50, type: 'DEBIT' }], []);
    expect(out.map((r) => r.amount)).toEqual([-100, -50]);
    expect(out.map((r) => r.type)).toEqual(['DEBIT', 'DEBIT']);
  });
});

describe('resolveAutoCorrectMinConfidence', () => {
  it('defaults to 0.8 and honors a valid env override', () => {
    const prev = process.env.AI_DIAGNOSTIC_AUTO_CORRECT_MIN_CONFIDENCE;
    delete process.env.AI_DIAGNOSTIC_AUTO_CORRECT_MIN_CONFIDENCE;
    expect(resolveAutoCorrectMinConfidence()).toBe(0.8);
    process.env.AI_DIAGNOSTIC_AUTO_CORRECT_MIN_CONFIDENCE = '0.95';
    expect(resolveAutoCorrectMinConfidence()).toBe(0.95);
    if (prev === undefined) delete process.env.AI_DIAGNOSTIC_AUTO_CORRECT_MIN_CONFIDENCE;
    else process.env.AI_DIAGNOSTIC_AUTO_CORRECT_MIN_CONFIDENCE = prev;
  });
});

describe('applyDiagnosticCorrection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    pipelineState.reconcileAfterFlip = true;
    applyParseQualityPipeline.mockImplementation((stmt) => {
      const allNegative = (stmt.transactions || []).every((t) => Number(t.amount) <= 0);
      stmt.checksumRecon = { ok: pipelineState.reconcileAfterFlip && allNegative, delta: 0 };
    });
    attachChecksumDeltaProbe.mockResolvedValue(null);
  });

  it('skips when diagnosis is not COLUMN_FLIP', async () => {
    const stmt = { fileName: 'a.pdf', transactions: [{ amount: 100, type: 'DEBIT' }] };
    const res = await applyDiagnosticCorrection(stmt, { diagnosis: 'UNKNOWN', confidenceScore: 0.99, affectedRows: [] });
    expect(res.corrected).toBe(false);
    expect(res.reason).toBe('no_auto_correct');
    expect(applyParseQualityPipeline).not.toHaveBeenCalled();
  });

  it('skips when confidence is below threshold', async () => {
    const stmt = { fileName: 'a.pdf', transactions: [{ amount: 100, type: 'DEBIT' }] };
    const res = await applyDiagnosticCorrection(stmt, { diagnosis: 'COLUMN_FLIP', confidenceScore: 0.5, affectedRows: [] });
    expect(res.corrected).toBe(false);
  });

  it('auto-corrects COLUMN_FLIP and awaits the delta probe', async () => {
    const stmt = {
      fileName: 'feb.pdf',
      transactions: [{ amount: 500, type: 'DEBIT' }, { amount: 250, type: 'DEBIT' }]
    };
    const res = await applyDiagnosticCorrection(
      stmt,
      { diagnosis: 'COLUMN_FLIP', explanation: 'flip', confidenceScore: 0.9, affectedRows: [] },
      { businessAddress: 'x' }
    );
    expect(res.corrected).toBe(true);
    expect(stmt.parseQuality).toBe('OK');
    expect(stmt.aiDiagnostic.autoCorrected).toBe(true);
    expect(applyParseQualityPipeline).toHaveBeenCalledWith(stmt, { businessAddress: 'x' });
    expect(attachChecksumDeltaProbe).toHaveBeenCalledWith(stmt);
  });

  it('reverts to original rows when the flip does not reconcile', async () => {
    pipelineState.reconcileAfterFlip = false;
    const original = [{ amount: 500, type: 'DEBIT' }];
    const stmt = { fileName: 'feb.pdf', transactions: original.map((t) => ({ ...t })) };
    const res = await applyDiagnosticCorrection(
      stmt,
      { diagnosis: 'COLUMN_FLIP', explanation: 'flip', confidenceScore: 0.9, affectedRows: [] }
    );
    expect(res.corrected).toBe(false);
    expect(res.reason).toBe('flip_did_not_reconcile');
    expect(stmt.transactions[0].amount).toBe(500); // restored
    expect(stmt.aiDiagnostic.rescueMethod).toBe('COLUMN_FLIP_REVERTED');
  });
});
