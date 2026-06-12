import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('pdf-parse', () => ({
  default: vi.fn(async () => ({ text: 'x'.repeat(5000), numpages: 3 }))
}));

import { resolveExtractionMode, EXTRACTION_MODES } from '../../src/services/extraction/extractionModeRouter.js';

describe('resolveExtractionMode', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('detects digital_pdf for text-rich PDFs', async () => {
    const buf = Buffer.from('%PDF mock');
    const result = await resolveExtractionMode({
      buffer: buf,
      fileName: 'feb.pdf',
      mimetype: 'application/pdf'
    });
    expect(result.extractionMode).toBe(EXTRACTION_MODES.DIGITAL_PDF);
  });

  it('detects native CSV', async () => {
    const result = await resolveExtractionMode({
      buffer: Buffer.from('Date,Amount\n2025-01-01,10'),
      fileName: 'stmt.csv',
      mimetype: 'text/csv'
    });
    expect(result.extractionMode).toBe(EXTRACTION_MODES.NATIVE);
    expect(result.nativeFormat).toBe('csv');
  });
});
