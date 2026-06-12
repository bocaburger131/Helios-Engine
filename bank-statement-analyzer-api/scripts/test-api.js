import { simpleTester } from '../tests/testUtils/simpleTester.js';

async function runTests() {
  console.log('🧪 Running API Tests...');
  
  try {
    const results = await simpleTester.runBasicTests();
    
    // Count successes
    const successCount = Object.values(results).filter(r => r.success).length;
    const totalCount = Object.values(results).length;
    
    console.log(`\n📊 Summary: ${successCount}/${totalCount} tests passed`);
    
    // Exit with appropriate code
    process.exit(successCount === totalCount ? 0 : 1);
  } catch (error) {
    console.error('❌ Test execution failed:', error);
    process.exit(1);
  }
}

runTests();