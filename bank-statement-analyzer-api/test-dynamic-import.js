// Test dynamic import to troubleshoot the issue
console.log('=== Dynamic Import Test ===');

try {
  const module = await import('./src/services/riskAnalysisService.js');
  console.log('✅ Module imported successfully');
  console.log('Module keys:', Object.keys(module));
  console.log('Has default export:', 'default' in module);
  
  if (module.default) {
    console.log('Default export type:', typeof module.default);
    console.log('Constructor name:', module.default.constructor.name);
    
    // Test method availability
    const methods = ['calculateTotalDepositsAndWithdrawals', 'calculateNSFCount', 'analyzeRisk', 'calculateVeritasScore'];
    console.log('\n=== Method Availability ===');
    methods.forEach(method => {
      console.log(`${method}: ${typeof module.default[method]}`);
    });
    
    // Quick functional test
    console.log('\n=== Quick Functional Test ===');
    const testTransactions = [
      { amount: 1000, description: 'Payroll deposit' },
      { amount: -500, description: 'Rent payment' },
      { amount: -50, description: 'NSF fee' }
    ];
    
    const totals = module.default.calculateTotalDepositsAndWithdrawals(testTransactions);
    console.log('Totals calculation:', totals);
    
    const nsfCount = module.default.calculateNSFCount(testTransactions);
    console.log('NSF count:', nsfCount);
    
  } else {
    console.log('❌ No default export found');
  }
  
} catch (error) {
  console.error('❌ Import failed:', error.message);
}
