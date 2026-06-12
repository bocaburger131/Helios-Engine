import { service as riskAnalysisService } from './src/services/riskAnalysisService.js';

console.log('=== RISK ANALYSIS SERVICE TEST ===');
console.log('Service:', typeof riskAnalysisService);
console.log('Service keys:', Object.keys(riskAnalysisService || {}));

if (!riskAnalysisService) {
  console.error('❌ Service is null/undefined');
  process.exit(1);
}

// Test basic functions
const testTransactions = [
  { amount: 100, description: 'Deposit', date: '2024-01-01' },
  { amount: -50, description: 'NSF fee', date: '2024-01-02' }
];

try {
  console.log('\n=== TESTING FUNCTIONS ===');
  
  console.log('Testing calculateNSFCount...');
  const nsfResult = riskAnalysisService.calculateNSFCount(testTransactions);
  console.log('✓ NSF Count:', nsfResult);
  
  console.log('Testing calculateTotalDepositsAndWithdrawals...');
  const totalsResult = riskAnalysisService.calculateTotalDepositsAndWithdrawals(testTransactions);
  console.log('✓ Totals:', totalsResult);
  
  console.log('Testing calculateAverageDailyBalance...');
  const balanceResult = riskAnalysisService.calculateAverageDailyBalance(testTransactions, 1000);
  console.log('✓ Balance:', balanceResult);
  
  console.log('Testing analyzeRisk...');
  const riskResult = riskAnalysisService.analyzeRisk(testTransactions, 1000);
  console.log('✓ Risk:', riskResult);
  
  console.log('\n✅ ALL FUNCTIONS WORKING!');
  
} catch (error) {
  console.error('❌ Function test failed:', error);
}
