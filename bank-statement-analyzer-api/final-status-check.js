// Quick test to verify everything is working
import riskAnalysisService from './src/services/riskAnalysisService.js';

console.log('=== FINAL STATUS CHECK ===');
console.log('Service loaded:', !!riskAnalysisService);
console.log('Available functions:', Object.keys(riskAnalysisService || {}));

// Test core functions
console.log('\n=== CORE FUNCTION TESTS ===');
try {
  const nsfResult = riskAnalysisService.calculateNSFCount([
    { description: 'NSF Fee', amount: -35 },
    { description: 'Deposit', amount: 100 }
  ]);
  console.log('✓ NSF Count:', nsfResult);

  const totalsResult = riskAnalysisService.calculateTotalDepositsAndWithdrawals([
    { amount: 100 },
    { amount: -50 }
  ]);
  console.log('✓ Totals:', totalsResult);

  const avgResult = riskAnalysisService.calculateAverageDailyBalance([
    { date: new Date(), amount: 100 }
  ], 1000);
  console.log('✓ Average Daily Balance:', avgResult);

  const riskResult = riskAnalysisService.analyzeRisk([
    { description: 'NSF Fee', amount: -35 },
    { amount: -200 }
  ], 500);
  console.log('✓ Risk Analysis:', riskResult);

  console.log('\n✅ ALL CORE FUNCTIONS WORKING!');
} catch (error) {
  console.log('\n❌ Error:', error.message);
}
