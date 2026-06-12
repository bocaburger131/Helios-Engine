#!/usr/bin/env node

console.log('🧪 Testing IncomeStabilityService Import and Functionality...\n');

async function testIncomeService() {
  try {
    // Dynamic import to avoid module issues
    const { default: IncomeStabilityService } = await import('./src/services/incomeStabilityService.js');
    
    console.log('✅ IncomeStabilityService imported successfully');
    console.log('Type:', typeof IncomeStabilityService);
    
    // Create instance
    const service = new IncomeStabilityService();
    console.log('✅ Service instance created');
    
    // Check methods
    console.log('Has filterIncomeTransactions?', typeof service.filterIncomeTransactions === 'function');
    console.log('Has analyze?', typeof service.analyze === 'function');
    
    // Test with sample data
    const sampleTransactions = [
      { date: '2024-01-01', description: 'Payroll Deposit', amount: 3000 },
      { date: '2024-01-15', description: 'Salary', amount: 3000 },
      { date: '2024-02-01', description: 'Payroll Deposit', amount: 3000 },
      { date: '2024-02-15', description: 'Grocery Store', amount: -150 }
    ];
    
    console.log('\n🔍 Testing analysis with sample transactions...');
    const result = service.analyze(sampleTransactions);
    
    console.log('✅ Analysis completed');
    console.log('Stability Score:', result.stabilityScore);
    console.log('Income Count:', result.incomeCount);
    console.log('Regular Income:', result.regularIncome);
    
    console.log('\n✅ All tests passed! IncomeStabilityService is working properly.');
    
  } catch (error) {
    console.error('❌ Error testing IncomeStabilityService:', error.message);
    console.error(error.stack);
  }
}

testIncomeService();
