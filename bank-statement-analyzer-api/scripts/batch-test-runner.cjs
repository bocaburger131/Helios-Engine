const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const glob = require('glob');

// Group test files by directory
function groupTestsByDirectory() {
  const testFiles = glob.sync('tests/**/*.test.js');
  const groups = {};
  
  testFiles.forEach(file => {
    const dir = path.dirname(file);
    if (!groups[dir]) {
      groups[dir] = [];
    }
    groups[dir].push(file);
  });
  
  return groups;
}

// Run tests by directory
function runTestsInBatches() {
  const groups = groupTestsByDirectory();
  const results = {
    passing: [],
    failing: []
  };
  
  console.log(`Found ${Object.keys(groups).length} test directories`);
  
  Object.entries(groups).forEach(([directory, files]) => {
    console.log(`\n--- Running tests in ${directory} (${files.length} files) ---`);
    
    try {
      execSync(`npx vitest run ${directory} --silent`, { stdio: 'pipe' });
      console.log(`✅ All tests in ${directory} passed!`);
      results.passing.push(directory);
    } catch (error) {
      console.log(`❌ Some tests in ${directory} failed`);
      results.failing.push(directory);
      
      // Try to run each test individually to identify which ones fail
      console.log(`\nChecking individual tests in ${directory}:`);
      
      files.forEach(file => {
        try {
          execSync(`npx vitest run ${file} --silent`, { stdio: 'pipe' });
          console.log(`  ✅ ${path.basename(file)} passed`);
        } catch (error) {
          console.log(`  ❌ ${path.basename(file)} failed`);
          results.failing.push(file);
        }
      });
    }
  });
  
  return results;
}

// Main execution
console.log('Running tests in batches by directory...');
const results = runTestsInBatches();

// Summary
console.log('\n--- SUMMARY ---');
console.log(`Passing directories: ${results.passing.length}`);
console.log(`Failing directories/files: ${results.failing.length}`);

if (results.failing.length > 0) {
  console.log('\nFailing directories/files:');
  results.failing.forEach(item => console.log(`- ${item}`));
}

// Save results to a file
fs.writeFileSync('batch-test-results.json', JSON.stringify(results, null, 2));
console.log('\nDetailed results saved to batch-test-results.json');