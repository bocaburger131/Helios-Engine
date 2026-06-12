// Test specifically for the clean test file import issue
import { service as riskAnalysisService } from './src/services/riskAnalysisService.js';

console.log('=== TESTING IMPORT IN CLEAN TEST CONTEXT ===');
console.log('riskAnalysisService:', riskAnalysisService);
console.log('Type:', typeof riskAnalysisService);
console.log('Keys:', Object.keys(riskAnalysisService || {}));

if (riskAnalysisService) {
  console.log('\nFunction availability:');
  console.log('calculateNSFCount:', typeof riskAnalysisService.calculateNSFCount);
  console.log('calculateTotalDepositsAndWithdrawals:', typeof riskAnalysisService.calculateTotalDepositsAndWithdrawals);
  console.log('calculateAverageDailyBalance:', typeof riskAnalysisService.calculateAverageDailyBalance);
  console.log('analyzeRisk:', typeof riskAnalysisService.analyzeRisk);
}

// Test the functions work
try {
  const result = riskAnalysisService.calculateNSFCount([]);
  console.log('\nTest NSF Count:', result);
} catch (error) {
  console.log('\nError testing NSF Count:', error.message);
}
