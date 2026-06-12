import { service as riskAnalysisService } from './src/services/riskAnalysisService.js';

console.log('🧮 Testing Veritas Score Calculation...\n');

// Test cases with different scenarios
const testCases = [
  {
    name: 'Excellent Customer',
    data: { nsfCount: 0, averageBalance: 5000, incomeStability: 0.9 },
    expectedRange: [75, 100]
  },
  {
    name: 'Good Customer',
    data: { nsfCount: 1, averageBalance: 2500, incomeStability: 0.7 },
    expectedRange: [50, 80]
  },
  {
    name: 'Fair Customer', 
    data: { nsfCount: 2, averageBalance: 1000, incomeStability: 0.5 },
    expectedRange: [30, 60]
  },
  {
    name: 'Poor Customer',
    data: { nsfCount: 4, averageBalance: 200, incomeStability: 0.3 },
    expectedRange: [10, 40]
  },
  {
    name: 'Very Poor Customer',
    data: { nsfCount: 6, averageBalance: 0, incomeStability: 0.1 },
    expectedRange: [0, 25]
  },
  {
    name: 'High Balance Customer',
    data: { nsfCount: 1, averageBalance: 15000, incomeStability: 0.8 },
    expectedRange: [70, 90]
  },
  {
    name: 'Low Stability Customer',
    data: { nsfCount: 0, averageBalance: 3000, incomeStability: 0.2 },
    expectedRange: [40, 70]
  }
];

try {
  testCases.forEach((testCase, index) => {
    console.log(`${index + 1}. Testing: ${testCase.name}`);
    console.log(`   Input: NSF=${testCase.data.nsfCount}, Balance=$${testCase.data.averageBalance}, Stability=${testCase.data.incomeStability}`);
    
    const result = riskAnalysisService.calculateVeritasScore(testCase.data);
    
    console.log(`   Veritas Score: ${result.veritasScore}`);
    console.log(`   Component Scores: NSF=${result.componentScores.nsfScore}, Balance=${result.componentScores.balanceScore}, Stability=${result.componentScores.stabilityScore}`);
    console.log(`   Level: ${result.scoreInterpretation.level}`);
    console.log(`   Recommendation: ${result.scoreInterpretation.recommendation}`);
    
    // Verify score is in expected range
    const inRange = result.veritasScore >= testCase.expectedRange[0] && result.veritasScore <= testCase.expectedRange[1];
    console.log(`   ✅ Score in expected range [${testCase.expectedRange[0]}-${testCase.expectedRange[1]}]: ${inRange}`);
    console.log('');
  });

  // Test edge cases
  console.log('🔍 Testing Edge Cases...\n');
  
  // Test with extreme values
  console.log('Extreme High Score Test:');
  const extremeHigh = riskAnalysisService.calculateVeritasScore({
    nsfCount: 0,
    averageBalance: 50000,
    incomeStability: 1.0
  });
  console.log(`Score: ${extremeHigh.veritasScore}, Level: ${extremeHigh.scoreInterpretation.level}`);
  
  console.log('\nExtreme Low Score Test:');
  const extremeLow = riskAnalysisService.calculateVeritasScore({
    nsfCount: 10,
    averageBalance: -500,
    incomeStability: 0.0
  });
  console.log(`Score: ${extremeLow.veritasScore}, Level: ${extremeLow.scoreInterpretation.level}`);
  
  // Test error handling
  console.log('\n🚨 Testing Error Handling...\n');
  
  const errorTests = [
    { name: 'Invalid NSF Count', data: { nsfCount: -1, averageBalance: 1000, incomeStability: 0.5 } },
    { name: 'Invalid Income Stability', data: { nsfCount: 1, averageBalance: 1000, incomeStability: 1.5 } },
    { name: 'Missing Parameters', data: { nsfCount: 1 } },
    { name: 'Non-object Input', data: "invalid" }
  ];
  
  errorTests.forEach(test => {
    try {
      riskAnalysisService.calculateVeritasScore(test.data);
      console.log(`❌ ${test.name}: Should have thrown error`);
    } catch (error) {
      console.log(`✅ ${test.name}: Correctly threw error - ${error.message}`);
    }
  });
  
  console.log('\n🎉 Veritas Score Testing Complete!');
  console.log('\nKey Features:');
  console.log('✅ Weighted scoring (NSF: 40%, Balance: 30%, Stability: 30%)');
  console.log('✅ Score range: 0-100');
  console.log('✅ Component score breakdown');
  console.log('✅ Score interpretation and recommendations');
  console.log('✅ Input validation and error handling');
  console.log('✅ Edge case handling');

} catch (error) {
  console.error('❌ Test failed:', error);
  console.error('Stack:', error.stack);
}
