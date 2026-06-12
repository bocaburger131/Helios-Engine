// Debug direct import test
console.log('=== TESTING DIRECT IMPORT ===');

try {
  // Try importing the service directly
  console.log('1. Importing service...');
  const riskService = await import('./src/services/riskAnalysisService.js');
  console.log('2. Import successful');
  console.log('3. Default export:', typeof riskService.default);
  console.log('4. Named exports:', Object.keys(riskService).filter(k => k !== 'default'));
  
  // Test the default export
  if (riskService.default) {
    console.log('5. Default export functions:', Object.keys(riskService.default));
    
    // Test a function call
    const testTransactions = [
      { amount: 100, description: 'Deposit', date: '2024-01-01' },
      { amount: -50, description: 'NSF fee', date: '2024-01-02' }
    ];
    
    console.log('6. Testing calculateNSFCount...');
    const nsfResult = riskService.default.calculateNSFCount(testTransactions);
    console.log('   NSF Count:', nsfResult);
    
    console.log('7. Testing calculateTotalDepositsAndWithdrawals...');
    const totalsResult = riskService.default.calculateTotalDepositsAndWithdrawals(testTransactions);
    console.log('   Totals:', totalsResult);
    
  } else {
    console.log('5. No default export found');
  }
  
  // Test named exports
  console.log('8. Testing named exports...');
  if (riskService.calculateNSFCount) {
    const namedResult = riskService.calculateNSFCount(testTransactions);
    console.log('   Named export NSF Count:', namedResult);
  } else {
    console.log('   No named calculateNSFCount function');
  }
  
} catch (error) {
  console.error('Import failed:', error);
}
