// Debug test for NSF calculation
import riskAnalysisService from './src/services/riskAnalysisService.js';

console.log('Testing NSF calculation...');

// Test the problematic case
const transactions = [
  { date: '2024-01-01', description: 'NSF FEE', amount: -35 },
  { date: '2024-01-02', description: null, amount: -30 },
  { date: '2024-01-03', description: 123, amount: -25 },
  { date: '2024-01-04', amount: -20 } // No description
];

try {
  console.log('Checking each transaction:');
  transactions.forEach((transaction, index) => {
    console.log(`Transaction ${index}:`, transaction);
    console.log(`  description:`, transaction.description);
    console.log(`  typeof description:`, typeof transaction.description);
    console.log(`  is string?:`, typeof transaction.description === 'string');
  });
  
  const result = riskAnalysisService.calculateNSFCount(transactions);
  console.log('Result:', result);
} catch (error) {
  console.error('Error:', error.message);
  console.error('Stack:', error.stack);
}
