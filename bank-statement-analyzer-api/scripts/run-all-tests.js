import { execSync } from 'child_process';
import path from 'path';
import fs from 'fs';

/**
 * Runs all tests in sequence with clear separation
 */
async function runAllTests() {
  console.log('🧪 Running all tests in sequence\n');
  
  const tests = [
    { name: 'Simple Unit Tests', command: 'npm run test:simple' },
    { name: 'Basic Integration Tests', command: 'npm run test:basic' },
    { name: 'API Integration Tests', command: 'npm run test:api-integration' }
  ];
  
  let passedTests = 0;
  let failedTests = 0;
  
  for (const test of tests) {
    console.log(`\n📋 Running: ${test.name}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    try {
      // Run the test and capture output
      const output = execSync(test.command, { stdio: 'inherit' });
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log(`✅ ${test.name} passed`);
      passedTests++;
    } catch (error) {
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log(`❌ ${test.name} failed`);
      failedTests++;
    }
  }
  
  // Print summary
  console.log('\n📊 Test Summary');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`Total tests: ${tests.length}`);
  console.log(`Passed: ${passedTests}`);
  console.log(`Failed: ${failedTests}`);
  
  if (failedTests === 0) {
    console.log('\n🎉 All tests passed!');
  } else {
    console.log(`\n⚠️ ${failedTests} test suites failed`);
    process.exit(1);
  }
}

runAllTests().catch(console.error);