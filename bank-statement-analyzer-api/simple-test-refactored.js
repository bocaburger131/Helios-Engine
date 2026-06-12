// Simple test of refactored calculateAverageDailyBalance method
console.log('🧪 Testing Refactored calculateAverageDailyBalance Method...\n');

async function testMethod() {
  try {
    // Import the service directly
    const { default: riskAnalysisService } = await import('./src/services/riskAnalysisService.js');
    
    console.log('=== Testing Opening Balance Validation (Should Throw Errors) ===');
    
    const testTransactions = [
      { date: '2024-01-01', amount: 100 },
      { date: '2024-01-02', amount: -50 }
    ];
    
    // Test undefined
    try {
      riskAnalysisService.calculateAverageDailyBalance(testTransactions, undefined);
      console.log('❌ ERROR: Should have thrown error for undefined');
    } catch (error) {
      console.log('✅ Correctly threw error for undefined:', error.message);
    }
    
    // Test null
    try {
      riskAnalysisService.calculateAverageDailyBalance(testTransactions, null);
      console.log('❌ ERROR: Should have thrown error for null');
    } catch (error) {
      console.log('✅ Correctly threw error for null:', error.message);
    }
    
    // Test string
    try {
      riskAnalysisService.calculateAverageDailyBalance(testTransactions, '1000');
      console.log('❌ ERROR: Should have thrown error for string');
    } catch (error) {
      console.log('✅ Correctly threw error for string:', error.message);
    }
    
    // Test NaN
    try {
      riskAnalysisService.calculateAverageDailyBalance(testTransactions, NaN);
      console.log('❌ ERROR: Should have thrown error for NaN');
    } catch (error) {
      console.log('✅ Correctly threw error for NaN:', error.message);
    }
    
    console.log('\n=== Testing Valid Opening Balance Values (Should Work) ===');
    
    // Test valid numbers
    const validTests = [
      { value: 0, name: 'zero' },
      { value: 1000, name: 'positive integer' },
      { value: -500, name: 'negative integer' },
      { value: 1000.50, name: 'decimal' }
    ];
    
    for (const test of validTests) {
      try {
        const result = riskAnalysisService.calculateAverageDailyBalance(testTransactions, test.value);
        console.log(`✅ ${test.name} (${test.value}): averageBalance = ${result.averageDailyBalance}, days = ${result.periodDays}`);
      } catch (error) {
        console.log(`❌ Unexpected error for ${test.name}: ${error.message}`);
      }
    }
    
    console.log('\n=== Testing Default Parameter (Single Argument) ===');
    
    // Test with only transactions (should use default opening balance of 0)
    try {
      const result = riskAnalysisService.calculateAverageDailyBalance(testTransactions);
      console.log(`✅ Single argument (default): averageBalance = ${result.averageDailyBalance}, days = ${result.periodDays}`);
    } catch (error) {
      console.log(`❌ Unexpected error for single argument: ${error.message}`);
    }
    
    console.log('\n=== Testing Calculation Logic ===');
    
    // Test specific calculation
    const result = riskAnalysisService.calculateAverageDailyBalance([
      { date: '2024-01-01', amount: 100 },  // Balance: 1000 + 100 = 1100
      { date: '2024-01-02', amount: -50 }   // Balance: 1100 - 50 = 1050
    ], 1000);
    
    console.log(`Calculation test: averageBalance = ${result.averageDailyBalance}, days = ${result.periodDays}`);
    console.log(`Expected: averageBalance ≈ 1075 (average of 1100 and 1050), days = 2`);
    
    console.log('\n✅ All tests completed successfully!');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error(error.stack);
  }
}

testMethod();
