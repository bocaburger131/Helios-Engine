// Test direct import of risk analysis service
import { service as riskAnalysisService } from './src/services/riskAnalysisService.js';

console.log('=== Risk Analysis Service Import Test ===');
console.log('Service imported:', riskAnalysisService !== undefined);
console.log('Service type:', typeof riskAnalysisService);
console.log('Service constructor name:', riskAnalysisService.constructor.name);

if (riskAnalysisService) {
  console.log('\n=== Available Methods ===');
  const methods = Object.getOwnPropertyNames(Object.getPrototypeOf(riskAnalysisService));
  methods.forEach(method => {
    if (typeof riskAnalysisService[method] === 'function') {
      console.log(`- ${method}()`);
    }
  });

  // Test specific methods
  console.log('\n=== Method Tests ===');
  console.log('calculateTotalDepositsAndWithdrawals exists:', typeof riskAnalysisService.calculateTotalDepositsAndWithdrawals);
  console.log('calculateNSFCount exists:', typeof riskAnalysisService.calculateNSFCount);
  console.log('analyzeRisk exists:', typeof riskAnalysisService.analyzeRisk);
  console.log('categorizeTransactionWithCache exists:', typeof riskAnalysisService.categorizeTransactionWithCache);
  console.log('calculateVeritasScore exists:', typeof riskAnalysisService.calculateVeritasScore);
} else {
  console.log('❌ Service is undefined or null');
}
