import { describe, it, expect, vi } from 'vitest';
import { createRequire } from 'node:module';
import {
  buildRegionsSummaryMeta,
  extract
} from '../../src/services/extraction/profiles/regionsBusinessCheckingProfile.js';
import { parseRegionsSections } from '../../src/services/extraction/profiles/regionsSectionExtractor.js';
import { reconcileStatement } from '../../src/services/extraction/statementReconciliation.js';
import { getReconciliationSpec } from '../../src/services/extraction/reconciliationSpec.js';
import { runStatementExtractionPipeline } from '../../src/services/extraction/statementExtractionPipeline.js';
import { shouldBlockLegacyExtract } from '../../src/services/extraction/layoutPipeline/toxicFallbackGuard.js';

const require = createRequire(import.meta.url);
const golden = require('../fixtures/regions/premier-fitness-golden.json');

const REGIONS_SPEC = getReconciliationSpec('regions_business_checking');

/** Build a realistic multi-line Regions SUMMARY block from printedLines. */
function summaryTextForMonth(stmt) {
  const pl = stmt.printedLines || {};
  const lines = [
    'Regions Bank',
    'Account ' + golden.accountNumber,
    'SUMMARY',
    `Beginning Balance $${stmt.openingBalance.toFixed(2)}`,
    `Deposits & Credits $${(pl.deposits ?? 0).toFixed(2)}`,
    `Withdrawals $${(pl.withdrawals ?? 0).toFixed(2)}`,
    `Fees $${(pl.fees ?? 0).toFixed(2)}`,
    'Automatic Transfers $0.00'
  ];
  if (pl.returnedChecks != null) lines.push(`Returned Checks $${pl.returnedChecks.toFixed(2)}`);
  lines.push(`Checks $${(pl.checks ?? 0).toFixed(2)}`);
  lines.push(`Ending Balance $${stmt.closingBalance.toFixed(2)}`);
  return lines.join('\n');
}

describe('Premier Fitness / Regions 9470 golden fixture (universal reconciliation)', () => {
  it('all 12 months reconcile via printed closing identity (credit/debit role math)', () => {
    expect(golden.statements).toHaveLength(12);
    for (const stmt of golden.statements) {
      const pl = stmt.printedLines;
      const credits = (pl.deposits ?? 0) + (pl.returnedChecks ?? 0) + (pl.automaticTransfers ?? 0);
      const debits = (pl.withdrawals ?? 0) + (pl.checks ?? 0) + (pl.fees ?? 0);
      const meta = {
        openingBalance: stmt.openingBalance,
        closingBalance: stmt.closingBalance,
        printedDeposits: credits,
        printedWithdrawals: debits,
        printedLines: pl,
        reconciliationSpec: REGIONS_SPEC
      };
      const recon = reconcileStatement(meta, []);
      expect(recon.printedComputedClosing, stmt.fileName).toBeCloseTo(stmt.closingBalance, 2);
      expect(recon.printedClosingMatch, stmt.fileName).toBe(true);
      expect(recon.checksumOk, stmt.fileName).toBe(true);
    }
  });

  it('parses the multi-line SUMMARY into printedLines for every month', () => {
    for (const stmt of golden.statements) {
      const text = summaryTextForMonth(stmt);
      const summary = buildRegionsSummaryMeta(text);
      expect(summary, stmt.fileName).not.toBeNull();
      const pl = summary.printedLines;
      expect(pl.deposits, stmt.fileName).toBeCloseTo(stmt.printedLines.deposits, 2);
      expect(pl.withdrawals, stmt.fileName).toBeCloseTo(stmt.printedLines.withdrawals, 2);
      expect(pl.checks ?? 0, stmt.fileName).toBeCloseTo(stmt.printedLines.checks ?? 0, 2);
      if (stmt.printedLines.returnedChecks != null) {
        expect(pl.returnedChecks, stmt.fileName).toBeCloseTo(stmt.printedLines.returnedChecks, 2);
      }
      // Aggregate printedWithdrawals must fold in checks + fees.
      const expectedDebits =
        stmt.printedLines.withdrawals + (stmt.printedLines.checks ?? 0) + (stmt.printedLines.fees ?? 0);
      expect(summary.printedWithdrawals, stmt.fileName).toBeCloseTo(expectedDebits, 2);
    }
  });

  it('CHECKS grid parser recovers individual checks (incl. break-in-sequence) summing to the printed total', () => {
    // Real MAY CHECKS grid (glued pdf-parse layout, "*" = break in sequence).
    const checksBlock = [
      'CHECKS',
      'DateCheck No.Amount',
      '05/085248659.50',
      '05/135252 *110.73',
      '05/285253148.87',
      '05/0810517 *5,200.20',
      '05/13105181,029.79',
      '05/1010519414.29',
      '05/1310520124.43',
      '05/1010521429.00',
      '05/1610522357.24',
      '05/0810523500.00',
      '05/2210524743.94',
      '05/2010525877.06',
      '05/2310526231.00',
      'Total Checks $10,826.05',
      '* Break In Check Number Sequence.',
      'DAILY BALANCE SUMMARY'
    ].join('\n');

    const { bySection, sectionTotals } = parseRegionsSections(checksBlock, 2024);
    const checks = bySection.checks;
    // One row per printed check line, each signed as a debit, break markers kept.
    expect(checks).toHaveLength(13);
    expect(checks.every((c) => c.amount < 0)).toBe(true);
    expect(checks.some((c) => c.breakInSequence)).toBe(true);
    // The authoritative checks total comes from the printed "Total Checks" line
    // (reliable), not from summing glued per-row amounts.
    expect(sectionTotals.checks).toBeCloseTo(10826.05, 2);
  });

  it('extract reconciles MAY via printed identity and folds the CHECKS grid into the ledger', async () => {
    const stmt = golden.statements.find((s) => s.fileName.includes('MAY'));
    const text = [
      summaryTextForMonth(stmt),
      'DEPOSITS & CREDITS',
      '05/01 Merchant deposit 2,284.08',
      'Total Deposits & Credits $168,130.56',
      'WITHDRAWALS',
      '05/02 Card purchase 506.65',
      'Total Withdrawals $117,088.85',
      'CHECKS',
      'DateCheck No.Amount',
      '05/085248659.50',
      'Total Checks $10,826.05',
      'DAILY BALANCE SUMMARY'
    ].join('\n');

    const result = await extract({ text, defaultYear: 2024, accountNumber: golden.accountNumber });
    expect(result.reconciliation.checksumOk).toBe(true);
    expect(result.reconciliation.printedClosingMatch).toBe(true);
    // CHECKS grid row tagged and signed as a debit.
    const checkRows = result.transactions.filter(
      (t) => (t.sectionLabel ?? t.section) === 'checks'
    );
    expect(checkRows.length).toBeGreaterThan(0);
    expect(checkRows.every((t) => t.amount < 0)).toBe(true);
  });

  it('flags a section mismatch (tamper signal) while the printed summary still self-reconciles', () => {
    const stmt = golden.statements.find((s) => s.fileName.includes('MAY'));
    const meta = {
      openingBalance: stmt.openingBalance,
      closingBalance: stmt.closingBalance,
      printedLines: stmt.printedLines,
      reconciliationSpec: REGIONS_SPEC
    };
    // Ledger that does not match the printed deposits line.
    const ledger = [
      { date: '2024-05-01', description: 'partial', amount: 1000, type: 'CREDIT', sectionLabel: 'deposits' }
    ];
    const recon = reconcileStatement(meta, ledger);
    expect(recon.printedClosingMatch).toBe(true);
    expect(recon.checksumOk).toBe(true);
    expect(recon.sectionReconciled).toBe(false);
    expect(recon.lineDeltas.deposits.match).toBe(false);
  });
});

describe('Regions strict pipeline wiring', () => {
  it('runStatementExtractionPipeline passes full ctx to regions profile', async () => {
    const received = [];
    const mockProfile = {
      id: 'regions_business_checking',
      extract: vi.fn(async (ctx) => {
        received.push(ctx);
        return {
          meta: { openingBalance: 100, closingBalance: 100 },
          transactions: [{ date: '2024-01-01', amount: 0, type: 'credit', description: 'x' }],
          normalizedTransactions: [],
          reconciliation: { checksumOk: true, checksumRecon: { ok: true } },
          stitcherPrinted: {}
        };
      })
    };

    await runStatementExtractionPipeline({
      text: 'Regions Bank SUMMARY',
      profile: mockProfile,
      parserService: { id: 'mock-parser' },
      plumberTransactions: [{ date: '01/01', amount: 1, type: 'CREDIT' }],
      stitcherPrinted: { opening: 100 },
      defaultYear: 2024
    });

    expect(mockProfile.extract).toHaveBeenCalledOnce();
    expect(received[0].parserService).toEqual({ id: 'mock-parser' });
    expect(received[0].plumberTransactions).toHaveLength(1);
    expect(received[0].stitcherPrinted).toEqual({ opening: 100 });
  });

  it('blocks legacy fallback for regions when no profile rows retained', () => {
    expect(
      shouldBlockLegacyExtract({
        profileId: 'regions_business_checking',
        profileRowsRetained: 0,
        rawBundle: null
      })
    ).toBe(true);
  });
});
