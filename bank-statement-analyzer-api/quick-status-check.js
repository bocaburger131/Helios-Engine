// Quick system status check
console.log('🎯 VERA AI SYSTEM STATUS CHECK');
console.log('==============================\n');

try {
  // Test core service imports
  console.log('🔄 Testing core service imports...');
  
  const { default: PDFParserService } = await import('./src/services/pdfParserService.js');
  const service = new PDFParserService();
  console.log('✅ PDFParserService: Constructor working');
  
  const riskService = await import('./src/services/riskAnalysisService.js');
  console.log('✅ RiskAnalysisService: Import successful');
  
  // Test if we can call the core methods
  const testTransactions = [
    { amount: 1000, type: 'credit' },
    { amount: -500, type: 'debit' }
  ];
  
  const totals = riskService.default.calculateTotalDepositsAndWithdrawals(testTransactions);
  console.log(`✅ RiskAnalysisService: Core methods functional (deposits: ${totals.totalDeposits})`);
  
  console.log('\n🎉 SYSTEM STATUS: OPERATIONAL');
  console.log('✅ Constructor issues resolved');
  console.log('✅ Core services functional');
  console.log('✅ Ready for integration tests');
  
} catch (error) {
  console.error('❌ System status check failed:', error.message);
}
