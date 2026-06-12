// Mock version of PDFParserService for tests
export class PDFParserService {
  async parsePDF(buffer) {
    return {
      transactions: [
        {
          date: '2024-01-01',
          description: 'Test Transaction',
          amount: 100.00
        }
      ],
      metadata: {
        accountHolder: 'Test Account',
        accountNumber: '1234',
        bankName: 'Test Bank',
        statementPeriod: {
          start: '2024-01-01',
          end: '2024-01-31'
        }
      }
    };
  }
}

// Export both default and named for flexible mocking
export default PDFParserService;
