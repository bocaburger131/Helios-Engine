const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Find the first test file if none is provided
const testFile = process.argv[2] || (() => {
  try {
    const files = fs.readdirSync('tests');
    for (const file of files) {
      if (file.endsWith('.test.js')) {
        return path.join('tests', file);
      }
    }
    
    // Look in subdirectories
    const subdirs = fs.readdirSync('tests');
    for (const subdir of subdirs) {
      const subdirPath = path.join('tests', subdir);
      if (fs.statSync(subdirPath).isDirectory()) {
        const subfiles = fs.readdirSync(subdirPath);
        for (const file of subfiles) {
          if (file.endsWith('.test.js')) {
            return path.join('tests', subdir, file);
          }
        }
      }
    }
  } catch (e) {
    console.error('Error finding test files:', e.message);
  }
  return null;
})();

if (!testFile) {
  console.error('No test file found or provided.');
  console.error('Usage: node diagnose-test.cjs [path/to/test.test.js]');
  process.exit(1);
}

console.log(`Diagnosing test file: ${testFile}`);

// Read the file content
try {
  const content = fs.readFileSync(testFile, 'utf8');
  console.log(`\nFile size: ${content.length} bytes`);
  
  // Output the first few lines for context
  console.log('\nFile preview:');
  console.log(content.split('\n').slice(0, 15).join('\n'));
  console.log('...');
  
  // Check for import patterns
  console.log('\nImport patterns:');
  const importRegex = /import\s+.*?from\s+['"]([^'"]+)['"]/g;
  let importMatch;
  const imports = [];
  
  while ((importMatch = importRegex.exec(content)) !== null) {
    imports.push(importMatch[0]);
  }
  
  if (imports.length > 0) {
    console.log(`Found ${imports.length} import statements:`);
    imports.forEach(imp => console.log(`- ${imp}`));
  } else {
    console.log('No ES Module import statements found.');
  }
  
  // Check for require patterns
  const requireRegex = /require\(['"]([^'"]+)['"]\)/g;
  let requireMatch;
  const requires = [];
  
  while ((requireMatch = requireRegex.exec(content)) !== null) {
    requires.push(requireMatch[0]);
  }
  
  if (requires.length > 0) {
    console.log(`\nFound ${requires.length} require statements:`);
    requires.forEach(req => console.log(`- ${req}`));
  } else {
    console.log('\nNo CommonJS require statements found.');
  }
  
  // Check for mock patterns
  console.log('\nMock patterns:');
  const mockRegex = /(?:vi|jest)\.mock\(['"]([^'"]+)['"]/g;
  let mockMatch;
  const mocks = [];
  
  while ((mockMatch = mockRegex.exec(content)) !== null) {
    mocks.push(mockMatch[0]);
  }
  
  if (mocks.length > 0) {
    console.log(`Found ${mocks.length} mock statements:`);
    mocks.forEach(mock => console.log(`- ${mock}`));
  } else {
    console.log('No mock statements found.');
  }
  
  // Check for describe/it patterns
  console.log('\nTest structure:');
  const describeRegex = /describe\(['"]([^'"]+)['"]/g;
  let describeMatch;
  const describes = [];
  
  while ((describeMatch = describeRegex.exec(content)) !== null) {
    describes.push(describeMatch[1]);
  }
  
  if (describes.length > 0) {
    console.log(`Found ${describes.length} describe blocks:`);
    describes.forEach(desc => console.log(`- ${desc}`));
  } else {
    console.log('No describe blocks found.');
  }
  
  const itRegex = /(?:it|test)\(['"]([^'"]+)['"]/g;
  let itMatch;
  const its = [];
  
  while ((itMatch = itRegex.exec(content)) !== null) {
    its.push(itMatch[1]);
  }
  
  if (its.length > 0) {
    console.log(`\nFound ${its.length} test cases:`);
    its.forEach(it => console.log(`- ${it}`));
  } else {
    console.log('\nNo test cases found.');
  }
  
  // Try to run the test with Vitest
  console.log('\nAttempting to run with Vitest:');
  try {
    execSync(`npx vitest run ${testFile} --silent`, { stdio: 'pipe' });
    console.log('✅ Test ran successfully with Vitest!');
  } catch (error) {
    console.log('❌ Test failed with Vitest:');
    console.log(error.stdout?.toString() || error.message);
  }
  
  // Common issues and suggested fixes
  console.log('\nPotential issues and fixes:');
  
  if (content.includes('@jest/globals')) {
    console.log('- Found @jest/globals import: Replace with imports from vitest');
  }
  
  if (content.includes('jest.')) {
    console.log('- Found jest references: Replace with vi');
  }
  
  if (requires.length > 0 && imports.length > 0) {
    console.log('- Mixed module systems: Stick to ES Module imports only');
  }
  
  if (content.includes('module.exports')) {
    console.log('- Found CommonJS exports: Replace with export or export default');
  }
  
  if (content.includes('done(') || content.match(/\(\s*done\s*\)\s*=>/)) {
    console.log('- Found done callbacks: Replace with async/await pattern');
  }
  
  const missingExtensions = imports.filter(imp => {
    const match = imp.match(/from\s+['"]([^'"]+)['"]/);
    if (!match) return false;
    const path = match[1];
    return (path.startsWith('./') || path.startsWith('../') || path.startsWith('@/')) && 
           !path.endsWith('.js') && !path.includes('node_modules');
  });
  
  if (missingExtensions.length > 0) {
    console.log('- Missing .js extensions in imports: Add .js to all local imports');
  }
  
} catch (error) {
  console.error(`Error reading or processing file: ${error.message}`);
}