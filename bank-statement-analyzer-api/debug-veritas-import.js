// Debug Veritas Score import
import riskAnalysisService from './src/services/riskAnalysisService.js';

console.log('Available functions in riskAnalysisService:');
console.log(Object.keys(riskAnalysisService));

console.log('\nIs calculateVeritasScore available?', typeof riskAnalysisService.calculateVeritasScore);

if (riskAnalysisService.calculateVeritasScore) {
  console.log('\nTesting calculateVeritasScore function...');
  
  const mockAnalysisResults = {
    riskAnalysis: {
      riskLevel: 'LOW',
      riskScore: 0.2
    }
  };
  
  const mockTransactions = [
    { type: 'credit', amount: 1000 },
    { type: 'debit', amount: 500 }
  ];
  
  try {
    const result = riskAnalysisService.calculateVeritasScore(mockAnalysisResults, mockTransactions);
    console.log('✅ Function works! Result:', result);
  } catch (error) {
    console.error('❌ Function error:', error);
  }
} else {
  console.log('❌ calculateVeritasScore function not found!');
}
