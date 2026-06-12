import { describe, it, expect } from 'vitest';
import pdfParserService, { PDFParserService, pdfParserService as namedSingleton } from '../../src/services/pdfParserService.js';

describe('pdfParserService exports', () => {
  it('provides a reusable singleton and a constructible parser class', () => {
    expect(typeof PDFParserService).toBe('function');
    expect(typeof pdfParserService).toBe('object');
    expect(pdfParserService).toBe(namedSingleton);

    const parser = new PDFParserService();
    expect(parser).toBeInstanceOf(PDFParserService);
    expect(typeof parser.parseStatement).toBe('function');
    expect(typeof pdfParserService.parseStatement).toBe('function');
  });
});
