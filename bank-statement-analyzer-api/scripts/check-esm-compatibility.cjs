const fs = require('fs');
const path = require('path');
const glob = require('glob');

// Find all test files
const testFiles = glob.sync('tests/**/*.test.js');
console.log(`Found ${testFiles.length} test files to check for ESM compatibility`);

const esmIssues = {
  requireStatements: [],
  moduleExports: [],
  dynamicImports: [],
  globalVariables: []
};

// Process each test file
testFiles.forEach(filePath => {
  const content = fs.readFileSync(filePath, 'utf8');
  
  // Check for require statements
  if (content.includes('require(')) {
    esmIssues.requireStatements.push(filePath);
  }
  
  // Check for module.exports
  if (content.includes('module.exports')) {
    esmIssues.moduleExports.push(filePath);
  }
  
  // Check for dynamic imports
  if (content.includes('import(')) {
    esmIssues.dynamicImports.push(filePath);
  }
  
  // Check for global variables that might not be available in ESM
  if (content.includes('__dirname') || content.includes('__filename')) {
    esmIssues.globalVariables.push(filePath);
  }
});

// Output results
console.log('\n--- ESM COMPATIBILITY ISSUES ---');
console.log(`Files with require statements: ${esmIssues.requireStatements.length}`);
console.log(`Files with module.exports: ${esmIssues.moduleExports.length}`);
console.log(`Files with dynamic imports: ${esmIssues.dynamicImports.length}`);
console.log(`Files with __dirname/__filename: ${esmIssues.globalVariables.length}`);

// Save detailed results to a file
fs.writeFileSync('esm-compatibility-issues.json', JSON.stringify(esmIssues, null, 2));
console.log('\nDetailed results saved to esm-compatibility-issues.json');