// Debug the calculateTotalDepositsAndWithdrawals function
import riskAnalysisService from './src/services/riskAnalysisService.js';

console.log('🔍 Debugging calculateTotalDepositsAndWithdrawals...');

const transactions = [
  { amount: 100 },
  { amount: -50 }
];

console.log('Input transactions:', transactions);

transactions.forEach((transaction, index) => {
  console.log(`Transaction ${index}:`, transaction);
  console.log(`  - Has transaction:`, !!transaction);
  console.log(`  - Amount type:`, typeof transaction.amount);
  console.log(`  - Amount value:`, transaction.amount);
  console.log(`  - Amount > 0:`, transaction.amount > 0);
  console.log(`  - typeof amount === 'number':`, typeof transaction.amount === 'number');
  console.log(`  - Combined condition:`, transaction && typeof transaction.amount === 'number');
});

const result = riskAnalysisService.calculateTotalDepositsAndWithdrawals(transactions);
console.log('\nResult:', result);
console.log('Expected: { totalDeposits: 100, totalWithdrawals: 50 }');
