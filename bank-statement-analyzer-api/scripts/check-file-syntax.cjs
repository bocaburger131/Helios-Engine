const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Get the file path from command line arguments
const filePath = process.argv[2];

if (!filePath) {
  console.error('Please provide a file path to check.');
  console.error('Usage: node check-file-syntax.cjs path/to/file.js');
  process.exit(1);
}

console.log(`Checking syntax for: ${filePath}`);

// Read the file content
try {
  const content = fs.readFileSync(filePath, 'utf8');
  console.log(`File size: ${content.length} bytes`);
  
  // Output the first few lines for context
  console.log('\nFile preview:');
  console.log(content.split('\n').slice(0, 10).join('\n'));
  console.log('...');
  
  // Try to parse with Node
  try {
    execSync(`node --check "${filePath}"`);
    console.log('\n✅ No syntax errors detected by Node.');
  } catch (error) {
    console.log('\n❌ Node syntax check failed:');
    try {
      const nodeOutput = execSync(`node --check "${filePath}" 2>&1`).toString();
      console.log(nodeOutput);
    } catch (e) {
      console.log(e.stdout.toString());
    }
  }
  
  // Check for common ESM issues
  const esmIssues = [];
  if (content.includes('require(')) esmIssues.push('- Contains require() statements (use import instead)');
  if (content.includes('module.exports')) esmIssues.push('- Contains module.exports (use export or export default instead)');
  if (content.includes('__dirname') || content.includes('__filename')) esmIssues.push('- Uses __dirname or __filename (use import.meta.url instead)');
  
  if (esmIssues.length > 0) {
    console.log('\nESM compatibility issues:');
    esmIssues.forEach(issue => console.log(issue));
  } else {
    console.log('\nNo common ESM compatibility issues detected.');
  }
  
  // Check for Jest to Vitest migration issues
  const jestIssues = [];
  if (content.includes('jest.')) jestIssues.push('- Contains jest references (use vi instead)');
  if (content.includes('@jest/globals')) jestIssues.push('- Imports from @jest/globals (import from vitest instead)');
  if (content.match(/\(\s*done\s*\)\s*=>/) || content.includes('done();')) jestIssues.push('- Uses done callbacks (use async/await instead)');
  
  if (jestIssues.length > 0) {
    console.log('\nJest to Vitest migration issues:');
    jestIssues.forEach(issue => console.log(issue));
  } else {
    console.log('\nNo common Jest to Vitest migration issues detected.');
  }
  
} catch (error) {
  console.error(`Error reading or processing file: ${error.message}`);
}