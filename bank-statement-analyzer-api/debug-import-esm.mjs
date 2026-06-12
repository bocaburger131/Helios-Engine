// Test individual function import
try {
  console.log('Importing riskAnalysisService...');
  const riskAnalysisService = await import('./src/services/riskAnalysisService.js');
  
  console.log('Module loaded successfully');
  console.log('Available exports:', Object.keys(riskAnalysisService));
  console.log('Default export keys:', riskAnalysisService.default ? Object.keys(riskAnalysisService.default) : 'No default export');
  
  if (riskAnalysisService.default && riskAnalysisService.default.calculateVeritasScore) {
    console.log('✅ calculateVeritasScore found in default export');
  } else {
    console.log('❌ calculateVeritasScore NOT found in default export');
  }
  
} catch (error) {
  console.error('Import failed:', error);
}
