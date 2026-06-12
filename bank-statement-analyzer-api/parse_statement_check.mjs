import { PDFParserService } from './src/services/pdfParserService.js';
import fs from 'fs';

async function run() {
  try {
    const parser = new PDFParserService();
    parser.perplexityService.analyzeText = async (prompt) => {
      if (prompt.includes('Analyze this document text')) {
        return { documentType: 'BANK_STATEMENT', bankName: 'Regions Bank', accountHolderName: 'Test Holder', statementAddress: '123 Main St' };
      }
      if (prompt.includes('Find the Beginning Balance (Summary)')) {
        return { openingBalance: 5000, closingBalance: 3450.25 };
      }
      return {};
    };

    const result = await parser.parsePDF('./tests/fixtures/sample-statement.pdf', { bankType: 'DEFAULT' });
    console.log(JSON.stringify({
      success: true,
      bankName: result.bankName,
      openingBalance: result.openingBalance,
      closingBalance: result.closingBalance,
      txCount: result.transactions?.length || 0,
      triagePassed: true
    }, null, 2));
  } catch (error) {
    console.log(JSON.stringify({
      success: false,
      name: error.name,
      message: error.message
    }, null, 2));
  }
}

run();

run();
