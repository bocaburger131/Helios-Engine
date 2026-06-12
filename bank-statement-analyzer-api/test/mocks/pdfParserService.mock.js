import { vi } from 'vitest';

// Mock PDFParserService for testing
vi.mock('../../src/services/pdfParserService.js', () => ({
  PDFParserService: class {
    constructor() {}
    async parse() {
      return {
        success: true,
        data: {
          transactions: [],
          metadata: {
            bankName: 'Test Bank',
            accountNumber: '****1234',
            statementPeriod: {
              start: '2024-01-01',
              end: '2024-01-31'
            }
          }
        }
      };
    }
  }
}));
