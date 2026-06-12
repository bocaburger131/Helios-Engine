// Quick test to verify the service works correctly
import { service as riskAnalysisService } from './src/services/riskAnalysisService.js';

console.log('🧪 Testing Risk Analysis Service Functions...');

// Test 1: calculateTotalDepositsAndWithdrawals
console.log('\n=== Testing calculateTotalDepositsAndWithdrawals ===');
try {
  const transactions = [
    { date: '2024-01-01', description: 'Payroll', amount: 2500.00 },
    { date: '2024-01-02', description: 'Grocery Store', amount: -125.50 },
    { date: '2024-01-03', description: 'ATM Withdrawal', amount: -200.00 },
    { date: '2024-01-04', description: 'Refund', amount: 50.25 },
    { date: '2024-01-05', description: 'Electric Bill', amount: -150.75 }
  ];

  const result = riskAnalysisService.calculateTotalDepositsAndWithdrawals(transactions);
  console.log('Result:', result);
  console.log('Expected deposits: 2550.25, Got:', result.totalDeposits);
  console.log('Expected withdrawals: 476.25, Got:', result.totalWithdrawals);
  console.log('Test passed:', result.totalDeposits === 2550.25 && result.totalWithdrawals === 476.25);
} catch (error) {
  console.error('❌ Error:', error.message);
}

// Test 2: calculateNSFCount
console.log('\n=== Testing calculateNSFCount ===');
try {
  const transactions = [
    { date: '2024-01-01', description: 'NSF FEE', amount: -35 },
    { date: '2024-01-02', description: 'Overdraft Protection Fee', amount: -30 },
    { date: '2024-01-03', description: 'Regular Transaction', amount: -50 },
    { date: '2024-01-04', description: 'INSUFFICIENT FUNDS CHARGE', amount: -35 },
    { date: '2024-01-05', description: 'Returned Item Fee', amount: -25 }
  ];

  const result = riskAnalysisService.calculateNSFCount(transactions);
  console.log('Result:', result);
  console.log('Expected: 4, Got:', result);
  console.log('Test passed:', result === 4);
} catch (error) {
  console.error('❌ Error:', error.message);
}

// Test 3: calculateAverageDailyBalance
console.log('\n=== Testing calculateAverageDailyBalance ===');
try {
  const transactions = [
    { date: '2024-01-01', description: 'Deposit', amount: 0 },
    { date: '2024-01-02', description: 'Deposit', amount: 1000 },
    { date: '2024-01-03', description: 'Withdrawal', amount: -200 },
    { date: '2024-01-04', description: 'Deposit', amount: 500 },
    { date: '2024-01-05', description: 'Withdrawal', amount: -300 }
  ];

  const result = riskAnalysisService.calculateAverageDailyBalance(transactions, 1000);
  console.log('Result:', result);
  console.log('Expected average: 1820, Got:', result.averageDailyBalance);
  console.log('Expected days: 5, Got:', result.periodDays);
  console.log('Test passed:', result.averageDailyBalance === 1820 && result.periodDays === 5);
} catch (error) {
  console.error('❌ Error:', error.message);
}

// Test 4: analyzeRisk
console.log('\n=== Testing analyzeRisk ===');
try {
  const transactions = [
    { date: '2024-01-01', description: 'NSF Fee', amount: -35 },
    { date: '2024-01-02', description: 'Overdraft Fee', amount: -30 },
    { date: '2024-01-03', description: 'NSF Fee', amount: -35 },
    { date: '2024-01-04', description: 'Withdrawal', amount: -100 }
  ];

  const result = riskAnalysisService.analyzeRisk(transactions, 100);
  console.log('Risk Analysis Result:', result);
  console.log('Expected risk level: HIGH, Got:', result.riskLevel);
  console.log('Risk score > 70:', result.riskScore > 70);
} catch (error) {
  console.error('❌ Error:', error.message);
}

console.log('\n✅ Function tests completed!');
