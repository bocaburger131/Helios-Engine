// Debug the risk analysis calculation
import riskAnalysisService from './src/services/riskAnalysisService.js';

console.log('🔍 Debugging Risk Analysis Logic...');

// Test the failing scenario from the tests
const transactions = [
  { date: '2024-01-01', description: 'Deposit', amount: 1000 },
  { date: '2024-01-02', description: 'Rent', amount: -800 },
  { date: '2024-01-03', description: 'Groceries', amount: -150 }
];

console.log('\n=== Testing Low Balance Scenario ===');
console.log('Transactions:', transactions);
console.log('Opening Balance:', 200);

try {
  // Test individual functions
  const totals = riskAnalysisService.calculateTotalDepositsAndWithdrawals(transactions);
  console.log('Totals:', totals);
  
  const balanceAnalysis = riskAnalysisService.calculateAverageDailyBalance(transactions, 200);
  console.log('Balance Analysis:', balanceAnalysis);
  
  const nsfCount = riskAnalysisService.calculateNSFCount(transactions);
  console.log('NSF Count:', nsfCount);
  
  const result = riskAnalysisService.analyzeRisk(transactions, 200);
  console.log('\n=== Final Risk Analysis ===');
  console.log('Risk Score:', result.riskScore);
  console.log('Risk Level:', result.riskLevel);
  console.log('Expected: MEDIUM (score >= 40)');
  console.log('Withdrawal Ratio:', result.withdrawalRatio);
  console.log('Average Daily Balance:', result.averageDailyBalance);
  
  console.log('\n=== Risk Score Breakdown ===');
  const withdrawalRatio = totals.totalWithdrawals / totals.totalDeposits;
  console.log(`Withdrawal ratio: ${withdrawalRatio} (${withdrawalRatio > 0.8 ? '+25 points' : '0 points'})`);
  console.log(`Average balance: ${balanceAnalysis.averageDailyBalance} (${balanceAnalysis.averageDailyBalance < 1000 ? '+20 points' : '0 points'})`);
  console.log(`Average balance < 0: ${balanceAnalysis.averageDailyBalance < 0 ? '+40 points' : '0 points'}`);
  console.log(`NSF count: ${nsfCount} (${nsfCount} * 30 = ${nsfCount * 30} points)`);
  
} catch (error) {
  console.error('❌ Error:', error.message);
  console.error(error.stack);
}

// Test another scenario that should be VERY_LOW
console.log('\n=== Testing Healthy Account Scenario ===');
const healthyTransactions = [
  { date: '2024-01-01', description: 'Salary', amount: 3000 },
  { date: '2024-01-02', description: 'Groceries', amount: -100 },
  { date: '2024-01-03', description: 'Utilities', amount: -150 }
];

try {
  const healthyResult = riskAnalysisService.analyzeRisk(healthyTransactions, 2000);
  console.log('Healthy Account Risk Score:', healthyResult.riskScore);
  console.log('Healthy Account Risk Level:', healthyResult.riskLevel);
  console.log('Expected: VERY_LOW');
} catch (error) {
  console.error('❌ Error in healthy scenario:', error.message);
}
