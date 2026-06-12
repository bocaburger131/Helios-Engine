import riskAnalysisService from '../../src/services/riskAnalysisService.js';

// Debug test to see what the service actually returns
console.log('Testing NSF count with various keywords:');
const testTransactions = [
  { date: '2024-01-01', description: 'Insufficient Balance', amount: -35 },
  { date: '2024-01-02', description: 'NON-SUFFICIENT FUNDS', amount: -35 },
  { date: '2024-01-03', description: 'OD FEE', amount: -30 },
  { date: '2024-01-04', description: 'Overdraft Charge', amount: -30 },
  { date: '2024-01-05', description: 'Return Item Fee', amount: -25 },
  { date: '2024-01-06', description: 'Regular transaction', amount: -50 }
];

const result = riskAnalysisService.calculateNSFCount(testTransactions);
console.log('Result:', result);

console.log('\nTesting with invalid descriptions:');
const invalidTransactions = [
  { date: '2024-01-01', description: 'NSF FEE', amount: -35 },
  { date: '2024-01-02', description: null, amount: -30 },
  { date: '2024-01-03', description: 123, amount: -25 },
  { date: '2024-01-04', amount: -20 }
];

const invalidResult = riskAnalysisService.calculateNSFCount(invalidTransactions);
console.log('Invalid result:', invalidResult);

console.log('\nTesting average daily balance with invalid opening balance:');
try {
  const avgResult = riskAnalysisService.calculateAverageDailyBalance([], 'not a number');
  console.log('Average result:', avgResult);
} catch (error) {
  console.log('Error:', error.message);
}