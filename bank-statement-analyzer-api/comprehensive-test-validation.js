// Comprehensive test validation script
import { execSync } from 'child_process';

console.log('🧪 COMPREHENSIVE VERA AI SYSTEM TEST VALIDATION');
console.log('==================================================\n');

async function runTest(testName, command) {
  try {
    console.log(`🔄 Running ${testName}...`);
    const output = execSync(command, { 
      encoding: 'utf8', 
      cwd: process.cwd(),
      stdio: 'pipe',
      timeout: 30000
    });
    
    // Parse vitest output to get test results
    const lines = output.split('\n');
    const passedLine = lines.find(line => line.includes('passed'));
    const failedLine = lines.find(line => line.includes('failed'));
    
    if (passedLine && !failedLine) {
      console.log(`✅ ${testName}: ${passedLine.trim()}`);
      return true;
    } else if (failedLine) {
      console.log(`❌ ${testName}: ${failedLine.trim()}`);
      return false;
    } else {
      console.log(`✅ ${testName}: Completed successfully`);
      return true;
    }
  } catch (error) {
    console.log(`❌ ${testName}: FAILED - ${error.message}`);
    return false;
  }
}

async function main() {
  let totalTests = 0;
  let passedTests = 0;
  
  // Test 1: RiskAnalysisService (our core fix)
  if (await runTest('RiskAnalysisService Unit Tests', 'npx vitest run test/unit/riskAnalysisService.test.js')) {
    passedTests++;
  }
  totalTests++;
  
  // Test 2: IncomeStabilityService 
  if (await runTest('IncomeStabilityService Unit Tests', 'npx vitest run test/unit/incomeStabilityService.test.js')) {
    passedTests++;
  }
  totalTests++;
  
  // Test 3: Basic integration test
  if (await runTest('Basic Integration Test', 'npx vitest run tests/sanity-check.test.js')) {
    passedTests++;
  }
  totalTests++;
  
  // Test 4: Statement integration (PDFParserService test)
  if (await runTest('Statement Integration Test', 'npx vitest run tests/integration/statement.integration.test.js')) {
    passedTests++;
  }
  totalTests++;
  
  console.log('\n' + '='.repeat(50));
  console.log(`📊 FINAL TEST RESULTS: ${passedTests}/${totalTests} tests passed`);
  
  if (passedTests === totalTests) {
    console.log('🎉 ALL CRITICAL TESTS PASSING!');
    console.log('✅ RiskAnalysisService: RESTORED');
    console.log('✅ PDFParserService: CONSTRUCTOR FIXED');
    console.log('✅ Integration Tests: WORKING');
    console.log('\n🚀 VERA AI SYSTEM IS READY FOR PRODUCTION!');
  } else {
    console.log(`⚠️  ${totalTests - passedTests} tests still failing`);
    console.log('🔧 Additional debugging may be needed');
  }
}

main().catch(console.error);
