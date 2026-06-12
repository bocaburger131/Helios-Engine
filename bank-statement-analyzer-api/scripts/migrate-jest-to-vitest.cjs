const fs = require('fs');
const path = require('path');
const glob = require('glob');

// Find all test files
const testFiles = glob.sync('tests/**/*.test.js');

console.log(`Found ${testFiles.length} test files to process`);

let modifiedCount = 0;

// Process each test file
testFiles.forEach(filePath => {
  let content = fs.readFileSync(filePath, 'utf8');
  let modified = false;
  
  // 1. Replace Jest imports with Vitest or jest-compat
  if (content.includes('@jest/globals')) {
    const importMatch = content.match(/import\s+{([^}]+)}\s+from\s+['"]@jest\/globals['"]/);
    if (importMatch) {
      content = content.replace(
        /import\s+{[^}]+}\s+from\s+['"]@jest\/globals['"]/,
        `import { ${importMatch[1]} } from 'vitest'`
      );
      modified = true;
    }
  }
  
  // 2. Replace jest.fn(), jest.mock(), etc. with vi.fn(), vi.mock(), etc.
  if (content.includes('jest.')) {
    content = content.replace(/jest\./g, 'vi.');
    modified = true;
  }
  
  // 3. Simplify vi.mock() calls by removing { __esModule: true }
  const mockRegex = /vi\.mock\(['"]([^'"]+)['"]\s*,\s*\(\)\s*=>\s*\(\{\s*__esModule:\s*true,\s*(.*?)\s*\}\)\)/gs;
  if (content.match(mockRegex)) {
    content = content.replace(mockRegex, 'vi.mock("$1", () => ($2))');
    modified = true;
  }
  
  // 4. Add .js extension to local imports
  const importRegex = /import\s+(?:{[^}]*}|\w+|\*\s+as\s+\w+)\s+from\s+['"]([^'"]+)['"]/g;
  let match;
  let newContent = content;
  
  while ((match = importRegex.exec(content)) !== null) {
    const importPath = match[1];
    // Only add .js to relative paths, not to node_modules
    if ((importPath.startsWith('./') || importPath.startsWith('../') || importPath.startsWith('@/')) 
        && !importPath.endsWith('.js') && !importPath.includes('node_modules')) {
      newContent = newContent.replace(
        new RegExp(`from\\s+['"]${importPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}['"]`, 'g'),
        `from '${importPath}.js'`
      );
      modified = true;
    }
  }
  
  content = newContent;
  
  // 5. Fix done callback usage in async tests (Vitest doesn't need this pattern)
  const doneRegex = /\)\s*=>\s*\{\s*([^}]*?)done\(\)/g;
  if (content.match(doneRegex)) {
    content = content.replace(doneRegex, ') => {\n    $1// done() removed - use async/await instead');
    modified = true;
  }
  
  // 6. Replace jest.useFakeTimers() with vi.useFakeTimers()
  if (content.includes('useFakeTimers')) {
    content = content.replace(/jest\.useFakeTimers\(\)/g, 'vi.useFakeTimers()');
    modified = true;
  }
  
  // 7. Replace jest.setTimeout() with vi.setConfig({ testTimeout: ... })
  const setTimeoutRegex = /jest\.setTimeout\((\d+)\)/g;
  if (content.match(setTimeoutRegex)) {
    content = content.replace(setTimeoutRegex, 'vi.setConfig({ testTimeout: $1 })');
    modified = true;
  }
  
  // 8. Handle .toEqual, .toBe, and other common matcher differences
  if (content.includes('.toThrow(')) {
    // Vitest is more strict about throw matchers
    content = content.replace(/\.toThrow\(([^)]*)\)/g, '.toThrowError($1)');
    modified = true;
  }
  
  // Save changes if modified
  if (modified) {
    fs.writeFileSync(filePath, content, 'utf8');
    modifiedCount++;
    console.log(`Modified: ${filePath}`);
  }
});

console.log(`Successfully migrated ${modifiedCount} test files`);