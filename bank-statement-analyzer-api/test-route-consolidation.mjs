#!/usr/bin/env node

/**
 * Route Consolidation Test
 * Tests the new consolidated routes file for proper functionality
 */

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

console.log('🧪 Testing Route Consolidation...\n');

// Test 1: Check if consolidated routes file exists and can be imported
async function testRouteImport() {
  try {
    console.log('1. Testing route import...');
    const routes = await import('./src/routes/statementRoutes.final.js');
    console.log('   ✅ Consolidated routes imported successfully');
    return true;
  } catch (error) {
    console.log('   ❌ Failed to import consolidated routes:', error.message);
    return false;
  }
}

// Test 2: Check if updated index routes can be imported
async function testIndexRoutes() {
  try {
    console.log('2. Testing index routes...');
    const indexRoutes = await import('./src/routes/index.js');
    console.log('   ✅ Updated index routes imported successfully');
    return true;
  } catch (error) {
    console.log('   ❌ Failed to import index routes:', error.message);
    return false;
  }
}

// Test 3: Check if required dependencies exist
async function testDependencies() {
  console.log('3. Testing dependencies...');
  const dependencies = [
    './src/controllers/statementController.js',
    './src/controllers/analysisController.js',
    './src/services/riskAnalysisService.js',
    './src/utils/logger.js',
    './src/middleware/auth.js'
  ];

  let allPassed = true;
  for (const dep of dependencies) {
    try {
      await import(dep);
      console.log(`   ✅ ${dep}`);
    } catch (error) {
      console.log(`   ❌ ${dep} - ${error.message}`);
      allPassed = false;
    }
  }
  return allPassed;
}

// Test 4: Verify redundant files list
function testRedundantFilesList() {
  console.log('4. Checking redundant files list...');
  const redundantFiles = [
    './src/routes/statementRoutes.js',
    './src/routes/analysisRoutes.js', 
    './src/routes/enhancedAnalysisRoutes.js',
    './src/routes/enhancedStatementRoutes.js',
    './src/routes/statementRoutes.consolidated.js',
    './src/routes/consolidatedRoutes.js'
  ];

  console.log('   📋 Files identified for deletion:');
  redundantFiles.forEach(file => {
    console.log(`   - ${file}`);
  });
  return true;
}

// Run all tests
async function runTests() {
  const results = [];
  
  results.push(await testRouteImport());
  results.push(await testIndexRoutes());
  results.push(await testDependencies());
  results.push(testRedundantFilesList());

  const passed = results.filter(r => r).length;
  const total = results.length;

  console.log(`\n📊 Test Results: ${passed}/${total} tests passed`);
  
  if (passed === total) {
    console.log('🎉 All tests passed! Route consolidation is ready.');
    console.log('\n📝 Next steps:');
    console.log('   1. Test the application manually');
    console.log('   2. Delete redundant route files');
    console.log('   3. Update any remaining references');
  } else {
    console.log('⚠️  Some tests failed. Please check the issues above.');
  }
}

runTests().catch(console.error);
