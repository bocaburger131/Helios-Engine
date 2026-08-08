import { describe, it, expect } from 'vitest';
import { PDFParserService } from '../../src/services/pdfParserService.js';
import { splitChaseRows } from '../../src/services/extraction/profiles/chaseBusinessCompleteProfile.js';

/** Passthrough stitcher so tests exercise parser orphan logic, not page slicing. */
function passthroughStitcher(text) {
  return {
    typeA: { printed: {} },
    typeB: { combinedText: text },
    typeC: {},
    anchors: { summaryEndSeen: true }
  };
}

describe('cross-page orphan amount stitch', () => {
  it('stitches date/desc + amount split across a Page N of M marker', async () => {
    const text = [
      'Transaction History',
      '06/15 POS DEBIT COFFEE SHOP DOWNTOWN',
      'Page 2 of 6',
      '42.50',
      '06/16 DIRECT DEP PAYROLL 1500.00'
    ].join('\n');

    const svc = new PDFParserService();
    const parser = svc.bankParsers.get('DEFAULT');
    const txns = await svc._extractTransactions(text, parser, {
      defaultYear: 2024,
      stitcher: passthroughStitcher(text)
    });

    const coffee = txns.find((t) => /COFFEE/i.test(t.description || ''));
    expect(coffee).toBeTruthy();
    expect(coffee._pendingOrphanAmount).toBeUndefined();
    expect(Math.abs(Number(coffee.amount))).toBeCloseTo(42.5, 2);

    const payroll = txns.find((t) => /PAYROLL/i.test(t.description || ''));
    expect(payroll).toBeTruthy();
    expect(Math.abs(Number(payroll.amount))).toBeCloseTo(1500, 2);
  });

  it('drops unresolved orphans at end of loop (no amount after page marker)', async () => {
    const text = [
      'Transaction History',
      '06/15 POS DEBIT ORPHAN WITHOUT AMOUNT',
      'Page 2 of 6',
      '06/16 DIRECT DEP PAYROLL 1500.00'
    ].join('\n');

    const svc = new PDFParserService();
    const parser = svc.bankParsers.get('DEFAULT');
    const txns = await svc._extractTransactions(text, parser, {
      defaultYear: 2024,
      stitcher: passthroughStitcher(text)
    });

    expect(txns.every((t) => !t._pendingOrphanAmount)).toBe(true);
    expect(txns.some((t) => /ORPHAN WITHOUT AMOUNT/i.test(t.description || ''))).toBe(false);
    expect(txns.some((t) => /PAYROLL/i.test(t.description || ''))).toBe(true);
  });

  it('splitChaseRows keeps open row across page markers', () => {
    const section = [
      'DEPOSITS AND ADDITIONS',
      '01/15 Zelle Payment From Vendor',
      'Page 2 of 4',
      'ABC 200.00',
      '01/16 Wire Credit Partner LLC 50.00'
    ].join('\n');

    const rows = splitChaseRows(section);
    expect(rows.length).toBeGreaterThanOrEqual(2);

    const zelle = rows.find((r) => /Zelle/i.test(r.text));
    expect(zelle).toBeTruthy();
    expect(zelle.text).toMatch(/200\.00/);
    expect(zelle.text).not.toMatch(/Page\s+2/i);
  });
});
