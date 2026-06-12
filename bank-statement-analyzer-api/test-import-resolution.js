// Test import resolution
console.log('=== Testing import resolution ===');

try {
  console.log('Attempting to import riskAnalysisService...');
  const { default: service } = await import('./src/services/riskAnalysisService.js');
  
  console.log('Import successful!');
  console.log('Service:', service);
  console.log('Service constructor:', service.constructor.name);
  console.log('Service instanceof checks:', {
    hasCalculateMethod: typeof service.calculateTotalDepositsAndWithdrawals === 'function',
    hasNSFMethod: typeof service.calculateNSFCount === 'function',
    hasAnalyzeMethod: typeof service.analyzeRisk === 'function'
  });
  
} catch (error) {
  console.error('Import failed:', error);
}

console.log('\n=== Trying alternative import ===');
try {
  const serviceModule = await import('./src/services/riskAnalysisService.js');
  console.log('Module keys:', Object.keys(serviceModule));
  console.log('Default export:', serviceModule.default);
  console.log('Default export constructor:', serviceModule.default?.constructor?.name);
} catch (error) {
  console.error('Alternative import failed:', error);
}
