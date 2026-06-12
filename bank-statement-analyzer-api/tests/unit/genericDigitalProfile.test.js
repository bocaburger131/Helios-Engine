import { describe, it, expect, vi } from 'vitest';
import { extract, PROFILE_ID } from '../../src/services/extraction/profiles/genericDigitalProfile.js';
import { extractDocumentPrintedTotals } from '../../src/services/extraction/printedVitalsService.js';

describe('genericDigitalProfile', () => {
  it('exports generic_digital profile id', () => {
    expect(PROFILE_ID).toBe('generic_digital');
  });

  it('extractDocumentPrintedTotals reads Total Deposits from digital text', () => {
    const text = `
Beginning Balance $1,000.00
Total Deposits and Additions $200.00
Total Checks Paid $100.00
Ending Balance $1,100.00
`;
    const totals = extractDocumentPrintedTotals(text);
    expect(totals?.printedDeposits).toBe(200);
    expect(totals?.printedWithdrawals).toBeGreaterThanOrEqual(100);
  });

  it('adopts plumber rows when text extraction is empty (best-effort)', async () => {
    const parserService = {
      _extractTransactions: vi.fn().mockResolvedValue([]),
      _extractBalances: vi.fn().mockResolvedValue({ opening: 1000, closing: 1100 }),
      bankParsers: new Map([['DEFAULT', {}]])
    };
    const text = `
Beginning Balance $1,000.00
Total Deposits and Additions $200.00
Ending Balance $1,100.00
01/15 Vendor payment 200.00
`;
    const result = await extract({
      text,
      parserService,
      resolvedBankType: 'DEFAULT',
      options: {},
      defaultYear: 2025,
      plumberTransactions: [
        {
          date: '01/15',
          description: 'Vendor payment',
          amount: 200,
          type: 'CREDIT',
          section: 'deposits'
        }
      ]
    });
    expect(result.transactions.length).toBeGreaterThan(0);
    expect(result.reconciliation).toBeDefined();
  });
});
