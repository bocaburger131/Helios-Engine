import riskAnalysisService from './src/services/riskAnalysisService.js';

console.log('=== Debug Risk Scores ===');

// Test 1: High risk test
console.log('\n1. High risk test (should be HIGH > 70):');
const transactions1 = [
  { date: '2024-01-01', description: 'NSF Fee', amount: -35 },
  { date: '2024-01-02', description: 'Overdraft Fee', amount: -30 },
  { date: '2024-01-03', description: 'NSF Fee', amount: -35 },
  { date: '2024-01-04', description: 'Withdrawal', amount: -100 }
];
const result1 = riskAnalysisService.analyzeRisk(transactions1, 100);
console.log('Result:', result1);
console.log('NSF Count:', riskAnalysisService.calculateNSFCount(transactions1));
const balanceAnalysis1 = riskAnalysisService.calculateAverageDailyBalance(transactions1, 100);
console.log('Balance Analysis:', balanceAnalysis1);

// Test 2: Medium risk test (should be LOW around 30)
console.log('\n2. Medium risk test (should be LOW):');
const transactions2 = [
  { date: '2024-01-01', description: 'Deposit', amount: 1000 },
  { date: '2024-01-02', description: 'Rent', amount: -800 },
  { date: '2024-01-03', description: 'Groceries', amount: -150 }
];
const result2 = riskAnalysisService.analyzeRisk(transactions2, 200);
console.log('Result:', result2);

// Test 3: Cap test (should be 100)
console.log('\n3. Cap test (should be 100):');
const transactions3 = [
  { date: '2024-01-01', description: 'NSF Fee', amount: -35 },
  { date: '2024-01-02', description: 'NSF Fee', amount: -35 },
  { date: '2024-01-03', description: 'NSF Fee', amount: -35 },
  { date: '2024-01-04', description: 'NSF Fee', amount: -35 },
  { date: '2024-01-05', description: 'NSF Fee', amount: -35 }
];
const result3 = riskAnalysisService.analyzeRisk(transactions3, -500);
console.log('Result:', result3);
console.log('NSF Count:', riskAnalysisService.calculateNSFCount(transactions3));
const balanceAnalysis3 = riskAnalysisService.calculateAverageDailyBalance(transactions3, -500);
console.log('Balance Analysis:', balanceAnalysis3);

// Test undefined error
console.log('\n4. Test undefined error:');
try {
  riskAnalysisService.calculateAverageDailyBalance([], undefined);
  console.log('ERROR: Should have thrown!');
} catch (error) {
  console.log('Correctly threw error:', error.message);
}
