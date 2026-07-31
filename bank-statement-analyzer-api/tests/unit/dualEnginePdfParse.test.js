import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  dualEngineParseEnabled,
  crossReferenceDualParse,
  applyDualEngineToParseResult,
  buildCandidateScore,
  rankCandidates,
  countDuplicateFingerprints,
  balanceCoverageOf
} from '../../src/services/extraction/dualEnginePdfParse.js';

function pdfParseResult(transactions, opening = 1000, closing = 1500) {
  return {
    success: true,
    transactions,
    openingBalance: opening,
    closingBalance: closing,
    balances: { opening, closing },
    metadata: {
      stitcher: {
        printedSummary: {
          opening,
          closing,
          totalDeposits: 500,
          totalWithdrawals: 0
        }
      }
    }
  };
}

function creditTxn(amount, date = '01/15/2025') {
  return { date, description: 'DEPOSIT', amount, type: 'credit' };
}

describe('dualEnginePdfParse', () => {
  beforeEach(() => {
    process.env.PDFPLUMBER_ENABLED = 'true';
    delete process.env.PDFPLUMBER_DUAL_PARSE;
  });

  afterEach(() => {
    delete process.env.PDFPLUMBER_ENABLED;
    delete process.env.PDFPLUMBER_DUAL_PARSE;
  });

  it('dualEngineParseEnabled respects PDFPLUMBER_DUAL_PARSE=false', () => {
    process.env.PDFPLUMBER_DUAL_PARSE = 'false';
    expect(dualEngineParseEnabled()).toBe(false);
  });

  it('keeps pdf-parse when plumber empty', () => {
    const pdf = pdfParseResult([creditTxn(500)]);
    const { transactions, chosenEngine, dualEngine } = crossReferenceDualParse(pdf, {
      success: false,
      transactions: [],
      error: 'zero_transactions'
    });
    expect(chosenEngine).toBe('pdf_parse');
    expect(transactions).toHaveLength(1);
    expect(dualEngine.plumberTxnCount).toBe(0);
    expect(dualEngine.pdfParseChecksumOk).toBe(true);
  });

  it('chooses plumber when pdf-parse checksum fails and plumber passes', () => {
    const pdf = pdfParseResult([creditTxn(100)], 1000, 1500);
    const plumber = {
      success: true,
      transactions: [creditTxn(500)],
      openingBalance: 1000,
      closingBalance: 1500,
      metadata: { engine: 'pdfplumber' }
    };
    const { transactions, chosenEngine, dualEngine } = crossReferenceDualParse(pdf, plumber);
    expect(chosenEngine).toBe('pdfplumber');
    expect(transactions[0].amount).toBe(500);
    expect(dualEngine.pdfParseChecksumOk).toBe(false);
    expect(dualEngine.plumberChecksumOk).toBe(true);
  });

  it('both checksum OK with agreement keeps pdf-parse', () => {
    const pdf = pdfParseResult([creditTxn(500)], 1000, 1500);
    const plumber = {
      success: true,
      transactions: [creditTxn(500)],
      openingBalance: 1000,
      closingBalance: 1500
    };
    const { transactions, chosenEngine, dualEngine } = crossReferenceDualParse(pdf, plumber);
    expect(chosenEngine).toBe('pdf_parse');
    expect(dualEngine.agreement).toBe(true);
    expect(transactions[0].description).toBe('DEPOSIT');
  });

  it('both fail sets dualEngineBothFailed and keeps pdf-parse txns', () => {
    const pdf = pdfParseResult([creditTxn(200)], 1000, 1500);
    const plumber = {
      success: true,
      transactions: [creditTxn(800)],
      openingBalance: 1000,
      closingBalance: 1500
    };
    const { chosenEngine, dualEngine } = crossReferenceDualParse(pdf, plumber);
    expect(chosenEngine).toBe('pdf_parse');
    expect(dualEngine.dualEngineBothFailed).toBe(true);
    expect(dualEngine.pdfParseChecksumOk).toBe(false);
    expect(dualEngine.plumberChecksumOk).toBe(false);
  });

  it('applyDualEngineToParseResult passthrough when dual disabled', () => {
    process.env.PDFPLUMBER_DUAL_PARSE = 'false';
    const pdf = pdfParseResult([creditTxn(500)]);
    const out = applyDualEngineToParseResult(pdf, {
      success: true,
      transactions: [creditTxn(500)]
    });
    expect(out.metadata?.dualEngine).toBeUndefined();
    expect(out.transactions).toHaveLength(1);
  });

  it('applyDualEngineToParseResult attaches dualEngine metadata', () => {
    const pdf = pdfParseResult([creditTxn(100)], 1000, 1500);
    const out = applyDualEngineToParseResult(pdf, {
      success: true,
      transactions: [creditTxn(500)],
      openingBalance: 1000,
      closingBalance: 1500,
      metadata: { engine: 'pdfplumber' }
    });
    expect(out.metadata.dualEngine.ranPlumber).toBe(true);
    expect(out.metadata.dualEngine.chosenEngine).toBe('pdfplumber');
    expect(out.metadata.extractionEngine).toBe('pdfplumber');
    expect(out.transactions[0].amount).toBe(500);
  });

  // ── Rescue-aware selection (spec: repaired plumber candidate scored) ──────

  function rescueCandidates(repairedTxns, baseTxns, outcome = 'RESCUE_APPLIED') {
    return [
      {
        id: 'plumber_repaired',
        source: 'plumber_repaired',
        transactions: repairedTxns,
        rescueOutcome: outcome,
      },
      {
        id: 'plumber_base',
        source: 'plumber_base',
        transactions: baseTxns,
        rescueOutcome: 'RESCUE_REJECTED',
      },
    ];
  }

  it('scores the repaired plumber candidate as a first-class contender', () => {
    const pdf = pdfParseResult([creditTxn(100)], 1000, 1500);
    const plumber = {
      success: true,
      transactions: [creditTxn(100)],
      openingBalance: 1000,
      closingBalance: 1500,
      droppedRows: [],
      uncertainAssignments: []
    };
    // Repaired ledger moves the deposit to 500 → checksum passes (1000+500=1500).
    const repaired = [creditTxn(500)];
    const base = [creditTxn(100)];
    const { transactions, chosenEngine, dualEngine } = crossReferenceDualParse(
      pdf,
      plumber,
      { rescueCandidates: rescueCandidates(repaired, base) }
    );
    // The repaired candidate wins: it passes checksum while both base and raw
    // profile branches fail (1000+100=1100 != 1500).
    expect(dualEngine.rescueAwareSelection).toBe(true);
    expect(dualEngine.winner.source).toBe('plumber_repaired');
    expect(dualEngine.winner.checksumOk).toBe(true);
    expect(chosenEngine).toBe('pdfplumber');
    expect(transactions[0].amount).toBe(500);
    // Score object carries every required field.
    const scored = dualEngine.candidates.find(c => c.source === 'plumber_repaired');
    expect(scored).toMatchObject({
      checksumOk: true,
      delta: 0,
      balanceEquationOk: true,
      duplicateFingerprintCount: 0,
      balanceCoverage: 0,
      rescueOutcome: 'RESCUE_APPLIED',
    });
  });

  it('keeps the pipeline candidate when the repaired ledger does not improve the score', () => {
    const pdf = pdfParseResult([creditTxn(200)], 1000, 1500);
    pdf.metadata.rescueOutcome = 'RESCUE_REJECTED';
    const plumber = {
      success: true,
      transactions: [creditTxn(200)],
      openingBalance: 1000,
      closingBalance: 1500,
      droppedRows: [],
      uncertainAssignments: []
    };
    // Repaired candidate is identical to base → same delta → pipeline wins
    // the deterministic tie (source priority, rejected repair never wins).
    const repaired = [creditTxn(200)];
    const base = [creditTxn(200)];
    const { transactions, chosenEngine, dualEngine } = crossReferenceDualParse(
      pdf,
      plumber,
      { rescueCandidates: rescueCandidates(repaired, base, 'RESCUE_REJECTED') }
    );
    expect(dualEngine.winner.source).toBe('pipeline');
    expect(dualEngine.winner.rescueOutcome).toBe('RESCUE_REJECTED');
    expect(chosenEngine).toBe('pdf_parse');
    expect(transactions[0].amount).toBe(200);
  });

  it('ranks by checksum first, then delta, then duplicates, coverage, unresolved, source', () => {
    // Plain score-shaped objects (buildCandidateScore computes these fields
    // from reconInput, so rankCandidates is tested directly here).
    const mk = (overrides) => ({
      id: 'x',
      source: 'plumber_repaired',
      checksumOk: false,
      delta: 0,
      duplicateFingerprintCount: 0,
      balanceCoverage: 0,
      unresolvedItemCount: 0,
      rescueOutcome: 'RESCUE_APPLIED',
      ...overrides,
    });

    const passHighDelta = mk({ id: 'a', checksumOk: true, delta: 500, duplicateFingerprintCount: 9, balanceCoverage: 0.9, unresolvedItemCount: 9 });
    const failLowDelta = mk({ id: 'b', checksumOk: false, delta: 1, duplicateFingerprintCount: 0, balanceCoverage: 0.1, unresolvedItemCount: 0 });
    const passLowDelta = mk({ id: 'c', checksumOk: true, delta: 0, duplicateFingerprintCount: 0, balanceCoverage: 0.5, unresolvedItemCount: 0 });
    const ranked = rankCandidates([passHighDelta, failLowDelta, passLowDelta]);
    expect(ranked[0].id).toBe('c'); // checksum pass + lowest delta
    expect(ranked[1].id).toBe('a'); // checksum pass, higher delta
    expect(ranked[2].id).toBe('b'); // checksum fail last

    // Tie on everything except source: repaired plumber beats raw profile.
    const tieRawProfile = mk({ id: 'raw', source: 'plumber_raw', checksumOk: true, delta: 10 });
    const tieRepaired = mk({ id: 'rep', source: 'plumber_repaired', checksumOk: true, delta: 10 });
    const tiePipeline = mk({ id: 'pipe', source: 'pipeline', checksumOk: true, delta: 10 });
    expect(rankCandidates([tieRawProfile, tiePipeline, tieRepaired])[0].id).toBe('rep');
    expect(rankCandidates([tieRawProfile, tiePipeline])[0].id).toBe('pipe');

    // Rejected repair loses the tie against the pipeline candidate.
    const rejectedRepair = mk({ id: 'rej', source: 'plumber_repaired', checksumOk: true, delta: 10, rescueOutcome: 'RESCUE_REJECTED' });
    expect(rankCandidates([rejectedRepair, tiePipeline])[0].id).toBe('pipe');

    // Fewer duplicates > higher coverage > fewer unresolved.
    const dupHeavy = mk({ id: 'dup', checksumOk: true, delta: 10, duplicateFingerprintCount: 3, balanceCoverage: 1 });
    const covHeavy = mk({ id: 'cov', checksumOk: true, delta: 10, duplicateFingerprintCount: 1, balanceCoverage: 0.9 });
    expect(rankCandidates([dupHeavy, covHeavy])[0].id).toBe('cov');
  });

  it('counts duplicate fingerprints and balance coverage', () => {
    const txns = [
      { date: '01/15/2025', description: 'A', amount: 1, rowFingerprint: 'fp1', balance: 10 },
      { date: '01/16/2025', description: 'B', amount: 2, rowFingerprint: 'fp2', balance: null },
      { date: '01/17/2025', description: 'A', amount: 1, rowFingerprint: 'fp1', balance: 12 },
      { date: '01/18/2025', description: 'C', amount: 3, rowFingerprint: 'fp1', balance: null },
    ];
    expect(countDuplicateFingerprints(txns)).toBe(2); // fp1 appears 3x → 2 extra
    expect(balanceCoverageOf(txns)).toBeCloseTo(0.5);
  });

  it('propagates the winner rescueOutcome into final parse metadata', () => {
    const pdf = pdfParseResult([creditTxn(100)], 1000, 1500);
    pdf.metadata.rescueOutcome = 'RESCUE_REJECTED';
    const plumber = {
      success: true,
      transactions: [creditTxn(100)],
      openingBalance: 1000,
      closingBalance: 1500,
      droppedRows: [],
      uncertainAssignments: []
    };
    const out = applyDualEngineToParseResult(pdf, plumber, {
      rescueCandidates: rescueCandidates([creditTxn(500)], [creditTxn(100)], 'RESCUE_APPLIED'),
    });
    expect(out.metadata.rescueOutcome).toBe('RESCUE_APPLIED');
    expect(out.metadata.dualEngine.rescueAwareSelection).toBe(true);
    expect(out.metadata.candidateScores).toBeInstanceOf(Array);
    expect(out.metadata.candidateScores.length).toBeGreaterThanOrEqual(3);
  });
});
