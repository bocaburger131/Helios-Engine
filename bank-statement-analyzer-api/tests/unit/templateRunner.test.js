import { describe, it, expect, beforeEach, vi } from 'vitest';
import pdfParse from 'pdf-parse';

vi.mock('pdf-parse', () => ({
  default: vi.fn()
}));

import {
  parseWithTemplate,
  normalizeLayoutTemplate,
  extractBalancesDeterministic
} from '../../src/services/templateRunner.js';
import { TemplateMismatchError } from '../../src/utils/errors.js';

const template = {
  headerAnchors: { tableStart: 'BEGIN_ROW', tableEnd: 'END_ROW' },
  columnMapping: {
    dateCol: 0,
    descCol: 1,
    amountCol: 2,
    balanceCol: 3
  },
  mathPattern: 'MINUS_PREFIX'
};

describe('templateRunner', () => {
  beforeEach(() => {
    vi.mocked(pdfParse).mockReset();
  });

  it('normalizeLayoutTemplate fills defaults', () => {
    const n = normalizeLayoutTemplate({ columnMapping: { dateCol: 2 } });
    expect(n.columnMapping.dateCol).toBe(2);
    expect(n.columnMapping.descCol).toBe(1);
    expect(n.columnMapping.amountCol).toBe(2);
    expect(n.headerAnchors.tableStart).toBe('');
  });

  it('extractBalancesDeterministic reads opening and closing', () => {
    const text = 'foo Beginning Balance $100.00 bar Ending Balance $250.00';
    const parser = { parseAmount: (s) => parseFloat(String(s).replace(/[$,]/g, '')) };
    const b = extractBalancesDeterministic(text, parser);
    expect(b.opening).toBe(100);
    expect(b.closing).toBe(250);
  });

  it('parseWithTemplate succeeds when balances reconcile', async () => {
    vi.mocked(pdfParse).mockResolvedValue({
      numpages: 1,
      text: [
        'Beginning Balance $100.00',
        'BEGIN_ROW',
        '01/15/2024  Sample deposit    50.00  150.00',
        'END_ROW',
        'Ending Balance $150.00'
      ].join('\n')
    });

    const buf = Buffer.from('%PDF-1.4');
    const result = await parseWithTemplate(buf, template, { rtn: '062000019', templateVersion: 3 });

    expect(result.success).toBe(true);
    expect(result.transactions.length).toBeGreaterThanOrEqual(1);
    expect(result.openingBalance).toBe(100);
    expect(result.closingBalance).toBe(150);
  });

  it('parseWithTemplate throws TemplateMismatchError when checksum fails', async () => {
    vi.mocked(pdfParse).mockResolvedValue({
      numpages: 1,
      text: [
        'Beginning Balance $100.00',
        'BEGIN_ROW',
        '01/15/2024  Sample deposit    50.00  150.00',
        'END_ROW',
        'Ending Balance $999.00'
      ].join('\n')
    });

    const buf = Buffer.from('%PDF-1.4');

    await expect(parseWithTemplate(buf, template, { rtn: '062000019', templateVersion: 1 })).rejects.toBeInstanceOf(
      TemplateMismatchError
    );
  });

  it('respects meta.openingBalance and meta.closingBalance overrides', async () => {
    vi.mocked(pdfParse).mockResolvedValue({
      numpages: 1,
      text: ['BEGIN_ROW', '01/15/2024  Sample deposit    50.00  150.00', 'END_ROW'].join('\n')
    });

    const buf = Buffer.from('%PDF-1.4');
    const result = await parseWithTemplate(buf, template, {
      openingBalance: 100,
      closingBalance: 150,
      rtn: '062000019',
      templateVersion: 2
    });

    expect(result.openingBalance).toBe(100);
    expect(result.closingBalance).toBe(150);
  });
});
