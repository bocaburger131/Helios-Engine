// Simple module test
console.log('Testing imports step by step...');

try {
  console.log('1. Testing TransactionCategory import...');
  const TransactionCategory = await import('../src/models/TransactionCategory.js');
  console.log('✓ TransactionCategory imported successfully');
  
  console.log('2. Testing llmCategorizationService import...');
  const llmService = await import('../src/services/llmCategorizationService.js');
  console.log('✓ llmCategorizationService imported successfully');
  
  console.log('3. Testing logger import...');
  const logger = await import('../src/utils/logger.js');
  console.log('✓ logger imported successfully');
  
  console.log('4. Testing riskAnalysisService import...');
  const riskService = await import('../src/services/riskAnalysisService.js');
  console.log('✓ riskAnalysisService imported successfully');
  console.log('riskService.default:', typeof riskService.default);
  console.log('riskService.default keys:', Object.keys(riskService.default || {}));
  
  // Test a method call
  console.log('5. Testing method call...');
  const result = riskService.default.calculateNSFCount([]);
  console.log('calculateNSFCount result:', result);
  
} catch (error) {
  console.error('Import error:', error.message);
  console.error('Stack:', error.stack);
}
