import PDFParserService from './src/services/pdfParserService.js';

const parser = new PDFParserService();

// Test the correction logic with some sample transactions
const testTransactions = [
  { description: "Card Purchase 03/31 Rocky's Ace Hardware Springfield OH Card 9109", amount: 25.71 },
  { description: "Payment Sent 03/31 Cash App*Pruden Estates Oakland CA Card 9109", amount: 200.00 },
  { description: "Zelle Payment From Prudent Estates L.L.C.", amount: 1000.00 },
  { description: "Remote Online Deposit 1", amount: 1827.15 },
  { description: "Standard ACH Pmnts Initial Fee", amount: 2.50 },
  { description: "Fedwire Credit Via: Firstbank", amount: 15000.00 }
];

console.log('Testing transaction type correction...');
console.log('='.repeat(60));

testTransactions.forEach((transaction, index) => {
  const testTx = {
    date: '2025-04-01',
    description: transaction.description,
    amount: transaction.amount,
    type: 'credit', // Default
    category: null
  };
  
  const corrected = parser.correctTransactionType(testTx);
  console.log(`${index + 1}. "${transaction.description}"`);
  console.log(`   Original: ${testTx.type} $${testTx.amount}`);
  console.log(`   Corrected: ${corrected.type} $${corrected.amount}`);
  console.log('');
});
