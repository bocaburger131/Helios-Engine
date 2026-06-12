// Simple test of RiskAnalysisService import
import { service as riskAnalysisService } from './src/services/riskAnalysisService.js';

console.log('Imported service:', riskAnalysisService);
console.log('Type:', typeof riskAnalysisService);

if (riskAnalysisService) {
  console.log('Service ready:', typeof riskAnalysisService);
  console.log('Methods:', Object.getOwnPropertyNames(Object.getPrototypeOf(riskAnalysisService)));
} else {
  console.log('Service is undefined or null');
}
