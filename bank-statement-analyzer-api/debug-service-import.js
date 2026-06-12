import riskAnalysisService from './src/services/riskAnalysisService.js';

console.log('=== DEBUG: riskAnalysisService import ===');
console.log('Type:', typeof riskAnalysisService);
console.log('Is null/undefined:', riskAnalysisService == null);
console.log('Keys:', Object.keys(riskAnalysisService || {}));
console.log('calculateTotalDepositsAndWithdrawals:', typeof riskAnalysisService?.calculateTotalDepositsAndWithdrawals);
console.log('calculateNSFCount:', typeof riskAnalysisService?.calculateNSFCount);
console.log('calculateAverageDailyBalance:', typeof riskAnalysisService?.calculateAverageDailyBalance);
console.log('analyzeRisk:', typeof riskAnalysisService?.analyzeRisk);

// Test a simple call
try {
  const testResult = riskAnalysisService.calculateTotalDepositsAndWithdrawals([]);
  console.log('Test call result:', testResult);
} catch (error) {
  console.log('Test call error:', error.message);
}
