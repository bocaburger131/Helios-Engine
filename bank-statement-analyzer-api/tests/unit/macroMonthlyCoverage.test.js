import { describe, it, expect } from 'vitest';

/**
 * Coverage helpers are module-private in statementController; replicate logic for unit test.
 */
const MONTH_NAME_MAP = {
  jan: 0,
  feb: 1,
  mar: 2,
  apr: 3,
  may: 4,
  jun: 5,
  jul: 6,
  aug: 7,
  sep: 8,
  oct: 9,
  nov: 10,
  dec: 11
};

function inferYearFromStatementTextPreview(parsedStatement) {
  const raw = parsedStatement?.parseResult?.rawText || '';
  const m = String(raw)
    .slice(0, 1200)
    .match(
      /\b(January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2},?\s+(\d{4})\b/i
    );
  if (m) return Number(m[2]);
  return new Date().getFullYear();
}

function parseCoverageFromFileName(fileName, parsedStatement = null) {
  const base = fileName.replace(/\.[^/.]+$/, '');
  const short = base.match(/^(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\.?$/i);
  if (short) {
    const mon = MONTH_NAME_MAP[short[1].toLowerCase()];
    const y = inferYearFromStatementTextPreview(parsedStatement);
    const lastDay = new Date(y, mon + 1, 0).getDate();
    const mm = String(mon + 1).padStart(2, '0');
    return { startDate: `${y}-${mm}-01`, endDate: `${y}-${mm}-${String(lastDay).padStart(2, '0')}` };
  }
  return null;
}

describe('macro monthly coverage helpers', () => {
  it('maps dec.pdf to December using year from statement text', () => {
    const cov = parseCoverageFromFileName('dec.pdf', {
      parseResult: { rawText: 'Initiate Business Checking December 31, 2024 Page 1' }
    });
    expect(cov.startDate).toBe('2024-12-01');
    expect(cov.endDate).toBe('2024-12-31');
  });

  it('maps feb.pdf to February 2025 from text preview', () => {
    const cov = parseCoverageFromFileName('feb.pdf', {
      parseResult: { rawText: 'February 28, 2025 statement' }
    });
    expect(cov.startDate).toBe('2025-02-01');
    expect(cov.endDate).toBe('2025-02-28');
  });
});
