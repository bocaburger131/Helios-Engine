import { service as riskAnalysisService } from './src/services/riskAnalysisService.js';

try {
  console.log('Calling with undefined...');
  const result = riskAnalysisService.calculateAverageDailyBalance([], undefined);
  console.log('ERROR: No exception thrown! Result:', result);
} catch (error) {
  console.log('SUCCESS: Exception thrown:', error.message);
}
