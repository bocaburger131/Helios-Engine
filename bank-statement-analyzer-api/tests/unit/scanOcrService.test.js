import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  extractTransactionsFromPdfBuffer,
  mapOcrJsonToParseResult,
  parseOcrDebugLines,
  setRunChildProcessImpl,
  resetRunChildProcessImpl
} from '../../src/services/extraction/scanOcrService.js';

describe('scanOcrService', () => {
  beforeEach(() => {
    process.env.OCR_ENABLED = 'true';
  });

  afterEach(() => {
    resetRunChildProcessImpl();
    delete process.env.OCR_ENABLED;
  });

  it('parseOcrDebugLines parses stderr telemetry', () => {
    const stderr = 'OCR_DEBUG page=1 text_len=1200 ocr_used=False txn_rows=42\n';
    const lines = parseOcrDebugLines(stderr);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ page: 1, textLen: 1200, ocrUsed: false, txnRows: 42 });
  });

  it('mapOcrJsonToParseResult normalizes plumber-shaped JSON', () => {
    const mapped = mapOcrJsonToParseResult(
      {
        transactions: [
          {
            date: '1/15',
            dateRaw: '1/15',
            description: 'Deposit',
            amount: 100,
            type: 'CREDIT',
            section: 'ocr'
          }
        ],
        openingBalance: 500,
        closingBalance: 600,
        metadata: { engine: 'pymupdf-tesseract' }
      },
      { defaultYear: 2025 }
    );
    expect(mapped.transactions).toHaveLength(1);
    expect(mapped.transactions[0].date).toBe('2025-01-15');
    expect(mapped.metadata.extractionEngine).toBe('pymupdf-tesseract');
  });

  it('extractTransactionsFromPdfBuffer uses mock child stdout', async () => {
    setRunChildProcessImpl(async () => ({
      stdout: JSON.stringify({
        transactions: [
          {
            date: '2/1',
            dateRaw: '2/1',
            description: 'Wire in',
            amount: 50,
            type: 'CREDIT',
            section: 'ocr'
          }
        ],
        openingBalance: 10,
        closingBalance: 60,
        metadata: { engine: 'pymupdf-tesseract', pageTelemetry: [] }
      }),
      stderr: 'OCR_DEBUG page=1 text_len=500 ocr_used=True txn_rows=1\n'
    }));

    const result = await extractTransactionsFromPdfBuffer(Buffer.from('%PDF'), {
      fileName: 'scan.pdf',
      profileId: 'wells_initiate_checking',
      defaultYear: 2025
    });

    expect(result.success).toBe(true);
    expect(result.transactions).toHaveLength(1);
    expect(result.metadata.extractionEngine).toBe('pymupdf-tesseract');
  });

  it('returns disabled when OCR_ENABLED=false', async () => {
    process.env.OCR_ENABLED = 'false';
    const result = await extractTransactionsFromPdfBuffer(Buffer.from('x'), { fileName: 'a.pdf' });
    expect(result.success).toBe(false);
    expect(result.error).toBe('disabled');
  });
});
