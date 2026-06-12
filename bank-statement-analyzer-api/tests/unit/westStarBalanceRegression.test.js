import { describe, it, expect, vi } from 'vitest';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { PDFParserService, lineHintsDebitForMergedPdf, lineHintsCreditForMergedPdf } from '../../src/services/pdfParserService.js';
import { normalizeTransactionsWithBalanceInference } from '../../src/utils/transactionNormalization.js';
import riskAnalysisService from '../../src/services/riskAnalysisService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const fixturePath = join(__dirname, '../fixtures/weststar-anonymized-snippet.txt');

async function readFixtureText() {
  const fsActual = await vi.importActual('fs');
  const readFileSync = fsActual.readFileSync || fsActual.default?.readFileSync;
  return readFileSync(fixturePath, 'utf8');
}

describe('WestStar-style merged PDF lines (fixture + regression)', () => {
  it('documents row-level debit/credit hints used for trace (13163162-style investigation)', () => {
    expect(lineHintsDebitForMergedPdf('01/06/2024 POS DEBIT COFFEE SHOP 100.00')).toBe(true);
    expect(lineHintsDebitForMergedPdf('01/07/2024 9900.00 50.00 POS DEBIT GAS STATION')).toBe(true);
    expect(lineHintsCreditForMergedPdf('01/08/2024 DIRECT DEP PAYROLL 1500.00 11350.00')).toBe(true);
    expect(lineHintsDebitForMergedPdf('01/09/2024 ATM WITHDRAWAL DOWNTOWN 200.00 11150.00')).toBe(true);
    expect(lineHintsDebitForMergedPdf('01/10/2024 10150.00 25.00 MAINTENANCE FEE')).toBe(true);
  });

  it('parses fixture so estimated closing matches statement closing within tolerance', async () => {
    const raw = await readFixtureText();
    const svc = new PDFParserService();
    const parser = svc.bankParsers.get('DEFAULT');
    const tx = await svc._extractTransactions(raw, parser, { defaultYear: 2024 });
    expect(tx.length).toBeGreaterThanOrEqual(4);

    const normalized = normalizeTransactionsWithBalanceInference(tx);
    const totals = riskAnalysisService.calculateTotalDepositsAndWithdrawals(normalized);

    const opening = 10000;
    const closingStatement = 11125;
    const estimated = opening + totals.totalDeposits - totals.totalWithdrawals;

    expect(Math.abs(estimated - closingStatement)).toBeLessThanOrEqual(2.0);
  });
});
