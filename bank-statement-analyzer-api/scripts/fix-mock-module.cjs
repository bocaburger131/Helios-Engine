const fs = require('fs');
const path = require('path');
const glob = require('glob');

// Find all test files that use vi.unstable_mockModule
const testFiles = glob.sync('tests/**/*.test.js');
let fixedFiles = 0;

for (const filePath of testFiles) {
  let content = fs.readFileSync(filePath, 'utf8');
  
  // Check if the file uses vi.unstable_mockModule
  if (content.includes('vi.unstable_mockModule')) {
    // Replace with vi.mock
    content = content.replace(/vi\.unstable_mockModule\(['"]([^'"]+)['"]\s*,\s*\(\)\s*=>\s*\({/g, 
      'vi.mock(\'$1\', () => ({');
    
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`✅ Fixed vi.unstable_mockModule in ${filePath}`);
    fixedFiles++;
  }
}

console.log(`\nFixed vi.unstable_mockModule in ${fixedFiles} files`);