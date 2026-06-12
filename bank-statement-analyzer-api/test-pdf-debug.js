import PDFParserService from './src/services/pdfParserService.js';

const sampleText = `DEPOSITS AND ADDITIONS

04/01 Remote Online Deposit 1 $1,827.15
04/01 Remote Online Deposit 1 154.00
04/01 Payment Received 04/01 Ondeck 888-269-4246 Visa Direct NY Card 9109 2,500.00
04/01 Zelle Payment From Prudent Estates L.L.C. Pncaa0Qyl60J 1,000.00
04/01 Zelle Payment From Flavio Moreno Espinosa H50245642580 950.00

CHECKS PAID

904112 ^ 04/14 $4,734.28

ATM & DEBIT CARD WITHDRAWALS

04/01 Payment Sent 03/31 Cash App*Pruden Estates Oakland CA Card 9109 $200.00
04/01 Card Purchase 03/31 Rocky's Ace Hardware Springfield OH Card 9109 25.71
04/01 Card Purchase With Pin 04/01 Speedway Springfield OH Card 9109 43.94

ELECTRONIC WITHDRAWALS

Some electronic withdrawals here...

FEES

04/01 Standard ACH Pmnts Initial Fee $2.50
04/11 Domestic Incoming Wire Fee 15.00`;

const parser = new PDFParserService();

console.log('Testing PDF Parser with simplified Chase bank statement...');
console.log('='.repeat(60));

try {
  console.log('Raw text length:', sampleText.length);
  
  // Test section extraction
  const depositsMatch = sampleText.match(/DEPOSITS AND ADDITIONS([\s\S]*?)(?=CHECKS PAID|ATM & DEBIT CARD|ELECTRONIC WITHDRAWALS|FEES|$)/i);
  console.log('Deposits section found:', !!depositsMatch);
  if (depositsMatch) {
    console.log('Deposits section content length:', depositsMatch[1].length);
    console.log('First 200 chars:', depositsMatch[1].substring(0, 200));
  }
  
  const transactions = parser.parseTransactions(sampleText);
  
  console.log(`\nFound ${transactions.length} transactions:`);
  console.log('='.repeat(60));
  
  transactions.forEach((transaction, index) => {
    console.log(`${index + 1}. ${transaction.date} | ${transaction.type.toUpperCase()} | $${Math.abs(transaction.amount).toFixed(2)} | ${transaction.category} | ${transaction.description}`);
  });
  
} catch (error) {
  console.error('Error parsing transactions:', error);
  console.error('Stack trace:', error.stack);
}
