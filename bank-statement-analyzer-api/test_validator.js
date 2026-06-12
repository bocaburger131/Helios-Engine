import fs from 'fs/promises';
import { PDFParserService } from './src/services/pdfParserService.js';
const parser = new PDFParserService();
const syntheticText = [
  'REGIONS BANK',
  'Account Summary',
  'Beginning Balance $5,000.00',
  'Ending Balance $3,450.25',
  '',
  'DATE DESCRIPTION AMOUNT BALANCE',
  '04/10 POS PURCHASE -25.00 Current Balance $9,999.99',
  '04/11 ATM -100.00 Available Balance $8,888.88'
].join('\n');
let capturedPrompt = '';
parser.perplexityService.analyzeText = async (prompt) => {
  capturedPrompt = prompt;
  if (prompt.includes('Analyze this document text')) {
    return {
      documentType: 'BANK_STATEMENT',
      bankName: 'Regions Bank',
      accountHolderName: 'Test Holder',
      statementAddress: '123 Main St'
    };
  }
  return { openingBalance: 5000, closingBalance: 3450.25 };
};
const balancesAi = await parser._extractBalances(syntheticText, 'DEFAULT');
const promptHasGuardrails = capturedPrompt.includes('Ignore "Current Balance" or "Available Balance"') && 
                            capturedPrompt.includes('Account Summary');
parser.perplexityService.analyzeText = async () => {
  throw new Error('mock ai offline');
};
const balancesFallback = await parser._extractBalances(syntheticText, 'DEFAULT');
let sampleHeader = null;
try {
  const sample = await fs.readFile('./tests/fixtures/sample-statement.pdf');
  sampleHeader = sample.slice(0, 4).toString();
} catch (e) {}
console.log(JSON.stringify({ balancesAi, promptHasGuardrails, balancesFallback, sampleHeader }, null, 2));
