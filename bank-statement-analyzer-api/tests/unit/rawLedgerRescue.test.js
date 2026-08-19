/**
 * RAW_LEDGER rescue mode unit tests — the zero-ledger fallback tier.
 *
 * Covers: mode registration, classification gating (cap, money guard,
 * no-fire alongside surgical modes), prompt construction, acceptance gates
 * (bbox grounding, bare-number/summary/routing rejection), and overlay
 * application with signed amounts.
 */
import { describe, it, expect } from 'vitest';
import {
  RESCUE_MODES,
  ACTIVE_RESCUE_MODES,
  RAW_LEDGER_LINE_CAP,
  classifyRescueItems,
  buildRescuePrompt,
  dispatchRescueBatches,
  applyRepairs,
} from '../../src/services/extraction/aiRescueDispatcher.js';
import { validateModeSpecific } from '../../src/services/extraction/rescueAcceptanceGate.js';

function fakeRawRows(n) {
  const out = [];
  for (let i = 0; i < n; i += 1) {
    const amount = (10 + (i % 9000)).toFixed(2);
    out.push({
      page: Math.floor(i / 50) + 1,
      row_index: i % 50,
      line_text: `01/05/2025 line ${i} some description words ${amount}`,
      words: [
        { text: 'line', x0: 36, x1: 60, top: 100 + i, bottom: 115 + i },
        { text: String(i), x0: 60, x1: 80, top: 100 + i, bottom: 115 + i },
        { text: amount, x0: 80, x1: 110, top: 100 + i, bottom: 115 + i },
      ],
    });
  }
  return out;
}

describe('RAW_LEDGER mode registration', () => {
  it('is registered and dispatchable', () => {
    expect(RESCUE_MODES.RAW_LEDGER).toBe('RAW_LEDGER');
    expect(ACTIVE_RESCUE_MODES.has(RESCUE_MODES.RAW_LEDGER)).toBe(true);
    expect(RAW_LEDGER_LINE_CAP).toBe(600);
  });
});

describe('classifyRescueItems gating', () => {
  it('populates RAW_LEDGER when ledger + surgical evidence are all empty, capped at 600', () => {
    const { modeCounts, batches } = classifyRescueItems({
      transactions: [],
      droppedRows: [],
      uncertainAssignments: [],
      rawWordRows: fakeRawRows(1200),
    });
    expect(modeCounts[RESCUE_MODES.RAW_LEDGER]).toBe(600);
    expect(batches[RESCUE_MODES.RAW_LEDGER].length).toBe(600);
    expect(modeCounts[RESCUE_MODES.ROW_MERGE]).toBe(0);
    expect(modeCounts[RESCUE_MODES.COLUMN_REMAP]).toBe(0);
  });

  it('passes rows through unchanged under the cap', () => {
    const { modeCounts } = classifyRescueItems({
      transactions: [],
      droppedRows: [],
      uncertainAssignments: [],
      rawWordRows: fakeRawRows(50),
    });
    expect(modeCounts[RESCUE_MODES.RAW_LEDGER]).toBe(50);
  });

  it('does NOT fire when a ledger exists', () => {
    const { modeCounts } = classifyRescueItems({
      transactions: [{ date: '2025-01-01', description: 'x', amount: 1 }],
      droppedRows: [],
      uncertainAssignments: [],
      rawWordRows: fakeRawRows(50),
    });
    expect(modeCounts[RESCUE_MODES.RAW_LEDGER]).toBe(0);
  });

  it('does NOT fire when surgical evidence exists (dropped rows)', () => {
    const { modeCounts } = classifyRescueItems({
      transactions: [],
      droppedRows: [{ page: 1, drop_reason: 'no_date', amount: 12.5 }],
      uncertainAssignments: [],
      rawWordRows: fakeRawRows(50),
    });
    expect(modeCounts[RESCUE_MODES.RAW_LEDGER]).toBe(0);
  });

  it('money guard: only $0.00 lines never fire', () => {
    const noMoney = fakeRawRows(30).map((r, i) => ({
      ...r,
      line_text: i === 0 ? 'Opening Balance: $0.00' : `line ${i}`,
    }));
    const { modeCounts } = classifyRescueItems({
      transactions: [],
      droppedRows: [],
      uncertainAssignments: [],
      rawWordRows: noMoney,
    });
    expect(modeCounts[RESCUE_MODES.RAW_LEDGER]).toBe(0);
  });

  it('money guard: real money token fires', () => {
    const withMoney = fakeRawRows(10).map((r, i) => ({
      ...r,
      line_text: i === 3 ? '01/05/2025 CASH WITHDRAWAL 150.00' : r.line_text,
    }));
    const { modeCounts } = classifyRescueItems({
      transactions: [],
      droppedRows: [],
      uncertainAssignments: [],
      rawWordRows: withMoney,
    });
    expect(modeCounts[RESCUE_MODES.RAW_LEDGER]).toBe(10);
  });
});

describe('buildRescuePrompt', () => {
  it('builds a grounded reconstruction prompt with signed amounts and balance guard', () => {
    const prompt = buildRescuePrompt(RESCUE_MODES.RAW_LEDGER, fakeRawRows(5), {
      statementVitals: { printedDeposits: 1000.5, printedWithdrawals: 400.25 },
    });
    expect(prompt).not.toBeNull();
    expect(prompt.instruction).toMatch(/reconstructing the transaction ledger/);
    expect(prompt.instruction).toMatch(/SIGNED/);
    expect(prompt.instruction).toMatch(/running balance/);
  });
});

describe('dispatchRescueBatches gates', () => {
  it('accepts only bbox-grounded, real transaction rows', async () => {
    const validRepair = {
      decision: 'promote_to_transaction',
      confidence: 0.95,
      reason: 'visible transaction row',
      evidence: [{ text: 'AMAZON MARKETPLACE PMTS', bbox: [100, 100, 200, 120] }],
      proposed_transaction: {
        txn_date: '2025-01-05',
        description_raw: 'AMAZON MARKETPLACE PMTS',
        amount_cents: -14250,
      },
    };
    const badBareNumber = {
      decision: 'promote_to_transaction',
      confidence: 0.95,
      reason: 'bare number',
      evidence: [{ text: '8,432.17', bbox: [100, 100, 200, 120] }],
      proposed_transaction: { txn_date: '2025-01-05', description_raw: '8,432.17', amount_cents: -843217 },
    };
    const badNoBbox = {
      decision: 'promote_to_transaction',
      confidence: 0.95,
      reason: 'no bbox',
      evidence: [{ text: 'SOMETHING' }],
      proposed_transaction: { txn_date: '2025-01-05', description_raw: 'SOMETHING', amount_cents: -100 },
    };
    const badSummary = {
      decision: 'promote_to_transaction',
      confidence: 0.95,
      reason: 'summary echo',
      evidence: [{ text: 'Total Withdrawals', bbox: [100, 100, 200, 120] }],
      proposed_transaction: { txn_date: '2025-01-05', description_raw: 'Total Withdrawals', amount_cents: -40025 },
    };

    const batches = { [RESCUE_MODES.RAW_LEDGER]: fakeRawRows(5) };
    const aiClient = {
      async runRescue() {
        return { repairs: [validRepair, badBareNumber, badNoBbox, badSummary] };
      },
    };
    const { repairs, stats } = await dispatchRescueBatches(batches, aiClient, { existingTxns: [] });
    expect(repairs.length).toBe(1);
    expect(stats.repairsAttempted).toBe(4);
    expect(stats.repairsAccepted).toBe(1);
    expect(stats.rejected.length).toBe(3);
    expect(stats.modesUsed).toContain('RAW_LEDGER');
  });

  it('mode validator rejects a promoted row without bbox evidence', () => {
    const res = validateModeSpecific(
      {
        decision: 'promote_to_transaction',
        confidence: 0.95,
        evidence: [{ text: 'SOMETHING' }],
        proposed_transaction: { txn_date: '2025-01-05', description_raw: 'SOMETHING', amount_cents: -100 },
      },
      RESCUE_MODES.RAW_LEDGER
    );
    expect(res.passed).toBe(false);
  });
});

describe('applyRepairs overlay', () => {
  it('overlays signed credit/debit transactions without mutating the base', () => {
    const repairs = [
      {
        mode: 'RAW_LEDGER',
        decision: 'promote_to_transaction',
        confidence: 0.95,
        reason: 'row',
        evidence: [{ text: 'SALARY', bbox: [1, 1, 2, 2] }],
        proposed_transaction: { txn_date: '2025-01-10', description_raw: 'SALARY DEPOSIT', amount_cents: 250000 },
      },
      {
        mode: 'RAW_LEDGER',
        decision: 'promote_to_transaction',
        confidence: 0.95,
        reason: 'row',
        evidence: [{ text: 'POS DEBIT', bbox: [1, 1, 2, 2] }],
        proposed_transaction: { txn_date: '2025-01-11', description_raw: 'POS DEBIT CARD', amount_cents: -3999 },
      },
    ];
    const base = { transactions: [], normalizedTransactions: [], meta: {} };
    const repaired = applyRepairs(base, repairs);

    expect(repaired.transactions.length).toBe(2);
    expect(repaired.transactions[0].amount).toBeCloseTo(2500.0, 3);
    expect(repaired.transactions[0].type).toBe('CREDIT');
    expect(repaired.transactions[1].amount).toBeCloseTo(-39.99, 3);
    expect(repaired.transactions[1].type).toBe('DEBIT');
    expect(repaired.transactions[0].rescueMode).toBe('RAW_LEDGER');
    expect(repaired.transactions[0].source).toBe('ai_rescue');
    expect(base.transactions.length).toBe(0);
  });
});
