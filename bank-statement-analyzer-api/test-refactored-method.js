// Test the refactored calculateAverageDailyBalance method
import './tests/vitest.setup.js';

console.log('🧪 Testing Refactored calculateAverageDailyBalance Method...\n');

async function testRefactoredMethod() {
  try {
    // Import the actual service (bypassing any mocks)
    const { vi } = await import('vitest');
    vi.doUnmock('./src/services/riskAnalysisService.js');
    vi.unmock('./src/services/riskAnalysisService.js');
    
    const { default: riskAnalysisService } = await import('./src/services/riskAnalysisService.js');
    
    console.log('=== Testing Opening Balance Validation (Should Throw Errors) ===');
    
    const testTransactions = [
      { date: '2024-01-01', amount: 100 },
      { date: '2024-01-02', amount: -50 }
    ];
    
    // Test cases that should throw errors
    const invalidInputs = [
      { value: undefined, name: 'undefined' },
      { value: null, name: 'null' },
      { value: 'string', name: 'string "1000"', testValue: '1000' },
      { value: NaN, name: 'NaN' },
      { value: {}, name: 'empty object' },
      { value: [], name: 'empty array' },
      { value: true, name: 'boolean true' },
      { value: false, name: 'boolean false' }
    ];
    
    for (const input of invalidInputs) {
      try {
        const testValue = input.testValue !== undefined ? input.testValue : input.value;
        const result = riskAnalysisService.calculateAverageDailyBalance(testTransactions, testValue);
        console.log(`❌ ERROR: Should have thrown error for ${input.name}, but got result:`, result);
      } catch (error) {
        if (error.message === 'Opening balance must be a number') {
          console.log(`✅ Correctly threw error for ${input.name}: ${error.message}`);
        } else {
          console.log(`⚠️  Unexpected error for ${input.name}: ${error.message}`);
        }
      }
    }
    
    console.log('\n=== Testing Valid Opening Balance Values (Should Work) ===');
    
    // Test cases that should work
    const validInputs = [
      { value: 0, name: 'zero' },
      { value: 1000, name: 'positive integer' },
      { value: -500, name: 'negative integer' },
      { value: 1000.50, name: 'positive decimal' },
      { value: -250.75, name: 'negative decimal' },
      { value: 1e5, name: 'scientific notation' }
    ];
    
    for (const input of validInputs) {
      try {
        const result = riskAnalysisService.calculateAverageDailyBalance(testTransactions, input.value);
        console.log(`✅ ${input.name} (${input.value}): Result = ${JSON.stringify(result)}`);
      } catch (error) {
        console.log(`❌ Unexpected error for ${input.name}: ${error.message}`);
      }
    }
    
    console.log('\n=== Testing Default Parameter Behavior ===');
    
    // Test with only one argument (should use default of 0)
    try {
      const result = riskAnalysisService.calculateAverageDailyBalance(testTransactions);
      console.log(`✅ Single argument (default): Result = ${JSON.stringify(result)}`);
    } catch (error) {
      console.log(`❌ Unexpected error for single argument: ${error.message}`);
    }
    
    console.log('\n=== Testing Edge Cases ===');
    
    // Test with empty transactions array
    try {
      const result = riskAnalysisService.calculateAverageDailyBalance([], 1000);
      console.log(`✅ Empty transactions array: Result = ${JSON.stringify(result)}`);
    } catch (error) {
      console.log(`❌ Error with empty array: ${error.message}`);
    }
    
    // Test with invalid transactions array
    try {
      const result = riskAnalysisService.calculateAverageDailyBalance('not an array', 1000);
      console.log(`❌ Should have thrown error for invalid transactions`);
    } catch (error) {
      if (error.message === 'Transactions must be an array') {
        console.log(`✅ Correctly threw error for invalid transactions: ${error.message}`);
      } else {
        console.log(`⚠️  Unexpected error: ${error.message}`);
      }
    }
    
    console.log('\n=== Testing Calculation Logic ===');
    
    // Test specific calculation with known result
    const calculationTest = [
      { date: '2024-01-01', amount: 100 },  // Balance becomes 1100
      { date: '2024-01-02', amount: -50 }   // Balance becomes 1050
    ];
    
    const result = riskAnalysisService.calculateAverageDailyBalance(calculationTest, 1000);
    const expectedAverage = (1100 + 1050) / 2; // Should be 1075
    
    console.log(`Calculation test: Got ${result.averageDailyBalance}, Expected ~${expectedAverage}`);
    console.log(`Period days: ${result.periodDays} (expected 2)`);
    
    if (Math.abs(result.averageDailyBalance - expectedAverage) < 0.01 && result.periodDays === 2) {
      console.log(`✅ Calculation logic is correct`);
    } else {
      console.log(`❌ Calculation logic may have issues`);
    }
    
    console.log('\n✅ Refactored method testing completed!');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error(error.stack);
  }
}

testRefactoredMethod();
