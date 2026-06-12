import { describe, it, expect, vi, beforeEach } from 'vitest';

const { runDiagnosticCompletion } = vi.hoisted(() => ({
  runDiagnosticCompletion: vi.fn()
}));

vi.mock('../../src/services/aiOrchestratorService.js', () => ({
  runDiagnosticCompletion
}));

import {
  analyzeMismatch,
  coerceDiagnosticResult,
  DIAGNOSIS_CODES
} from '../../src/services/aiDiagnosticService.js';

const sampleTxns = [
  { date: '2025-02-01', description: 'Deposit', amount: 500, type: 'DEBIT' },
  { date: '2025-02-02', description: 'Deposit', amount: 250, type: 'DEBIT' }
];

describe('coerceDiagnosticResult', () => {
  it('clamps confidence and filters out-of-range affectedRows', () => {
    const out = coerceDiagnosticResult(
      { diagnosis: 'COLUMN_FLIP', explanation: 'flip', affectedRows: [0, 5, -1, 1], confidenceScore: 1.7 },
      2
    );
    expect(out.diagnosis).toBe('COLUMN_FLIP');
    expect(out.confidenceScore).toBe(1);
    expect(out.affectedRows).toEqual([0, 1]);
  });

  it('coerces invalid diagnosis to UNKNOWN and empties affectedRows', () => {
    const out = coerceDiagnosticResult(
      { diagnosis: 'NONSENSE', explanation: '', affectedRows: [0], confidenceScore: 0.9 },
      2
    );
    expect(out.diagnosis).toBe('UNKNOWN');
    expect(out.affectedRows).toEqual([]);
    expect(out.explanation).toBe('No explanation provided.');
  });

  it('exposes the canonical diagnosis codes', () => {
    expect(DIAGNOSIS_CODES).toContain('COLUMN_FLIP');
    expect(DIAGNOSIS_CODES).toContain('UNKNOWN');
  });
});

describe('analyzeMismatch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns UNKNOWN without calling the LLM when there are no transactions', async () => {
    const out = await analyzeMismatch({ transactions: [] });
    expect(out.diagnosis).toBe('UNKNOWN');
    expect(runDiagnosticCompletion).not.toHaveBeenCalled();
  });

  it('coerces the orchestrator result', async () => {
    runDiagnosticCompletion.mockResolvedValueOnce({
      diagnosis: 'COLUMN_FLIP',
      explanation: 'Deposits signed as debits',
      affectedRows: [0, 1],
      confidenceScore: 0.92
    });
    const out = await analyzeMismatch({
      transactions: sampleTxns,
      expectedClosingBalance: 1000,
      calculatedClosingBalance: 0,
      fileName: 'feb.pdf'
    });
    expect(runDiagnosticCompletion).toHaveBeenCalledTimes(1);
    expect(out.diagnosis).toBe('COLUMN_FLIP');
    expect(out.confidenceScore).toBeCloseTo(0.92);
    expect(out.affectedRows).toEqual([0, 1]);
  });

  it('returns UNKNOWN when the orchestrator throws', async () => {
    runDiagnosticCompletion.mockRejectedValueOnce(new Error('api down'));
    const out = await analyzeMismatch({ transactions: sampleTxns });
    expect(out.diagnosis).toBe('UNKNOWN');
    expect(out.confidenceScore).toBe(0);
  });
});
