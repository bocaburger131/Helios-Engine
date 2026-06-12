import { describe, it, expect } from 'vitest';
import {
  selectParserAdapter,
  listParserAdapters
} from '../../src/services/extraction/parserRegistry.js';
import { EXTRACTION_MODES } from '../../src/services/extraction/extractionModeRouter.js';

describe('parserRegistry', () => {
  it('selects OCR adapter for scan mode', () => {
    const adapter = selectParserAdapter({ extractionMode: EXTRACTION_MODES.SCAN });
    expect(adapter?.id).toBe('pymupdf-tesseract-ocr');
  });

  it('selects pdfplumber for digital rescue', () => {
    const adapter = selectParserAdapter({
      extractionMode: EXTRACTION_MODES.DIGITAL_PDF,
      rescue: true
    });
    expect(adapter?.id).toBe('pdfplumber-spatial');
  });

  it('returns null for digital without rescue flag', () => {
    const adapter = selectParserAdapter({ extractionMode: EXTRACTION_MODES.DIGITAL_PDF });
    expect(adapter).toBeNull();
  });

  it('lists multiple adapters when rescue on digital', () => {
    const list = listParserAdapters({
      extractionMode: EXTRACTION_MODES.DIGITAL_PDF,
      rescue: true,
      preferPlumber: true
    });
    expect(list.map((a) => a.id)).toContain('pdfplumber-spatial');
  });
});
