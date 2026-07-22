import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  dualEngineParseEnabled,
  crossReferenceDualParse,
  applyDualEngineToParseResult,
  aggregatePrintedDelta
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

  it('both checksum OK prefers plumber (coordinate provenance tie-break)', () => {
    const pdf = pdfParseResult([creditTxn(500)], 1000, 1500);
    const plumber = {
      success: true,
      transactions: [creditTxn(500)],
      openingBalance: 1000,
      closingBalance: 1500
    };
    const { transactions, chosenEngine, dualEngine } = crossReferenceDualParse(pdf, plumber);
    expect(chosenEngine).toBe('pdfplumber');
    expect(dualEngine.agreement).toBe(true);
    expect(dualEngine.selectionRule).toBe('verified_tiebreak_plumber_preferred');
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

  it('both fail picks engine closer to printed deposit totals', () => {
    const pdf = pdfParseResult([creditTxn(200)], 1000, 1500);
    const plumber = {
      success: true,
      transactions: [creditTxn(499)],
      openingBalance: 1000,
      closingBalance: 1500
    };
    const { chosenEngine, dualEngine, transactions } = crossReferenceDualParse(pdf, plumber);
    expect(chosenEngine).toBe('pdfplumber');
    expect(dualEngine.dualEngineBothFailed).toBe(true);
    expect(dualEngine.fallbackLowerAggregateDelta).toBe(true);
    expect(transactions[0].amount).toBe(499);
  });

  it('aggregatePrintedDelta sums deposit and withdrawal drift', () => {
    const score = { deposits: 200, withdrawals: 50, delta: 999 };
    const recon = { printedDeposits: 500, printedWithdrawals: 100 };
    expect(aggregatePrintedDelta(score, recon)).toBe(350);
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
});
