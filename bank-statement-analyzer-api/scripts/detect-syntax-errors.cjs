const fs = require('fs');
const path = require('path');
const glob = require('glob');
const { execSync } = require('child_process');

// Find all test files
const testFiles = glob.sync('tests/**/*.test.js');
console.log(`Found ${testFiles.length} test files to check for syntax errors`);

const filesWithSyntaxErrors = [];

// Check each file for syntax errors
testFiles.forEach(filePath => {
  console.log(`Checking: ${filePath}`);
  
  try {
    // Try to validate the file using Node's --check flag
    execSync(`node --check "${filePath}"`, { stdio: 'ignore' });
    console.log(`✅ No syntax errors in: ${filePath}`);
  } catch (error) {
    // If Node fails to parse, it's likely a syntax error
    filesWithSyntaxErrors.push({ filePath, error: error.message });
    console.log(`❌ Syntax error in: ${filePath}`);
    
    // Get more details by running with output
    try {
      const result = execSync(`node --check "${filePath}" 2>&1`).toString();
      console.log(result);
    } catch (detailError) {
      // This is expected - we just want the error output
    }
  }
});

// Output results
console.log('\n--- SYNTAX ERROR SUMMARY ---');
console.log(`Files with syntax errors: ${filesWithSyntaxErrors.length}`);

// Save results to a file
fs.writeFileSync('syntax-error-files.json', JSON.stringify(filesWithSyntaxErrors, null, 2));
console.log('\nList of files with syntax errors saved to syntax-error-files.json');

if (filesWithSyntaxErrors.length > 0) {
  console.log('\nFiles with syntax errors:');
  filesWithSyntaxErrors.forEach(file => console.log(`- ${file.filePath}`));
}