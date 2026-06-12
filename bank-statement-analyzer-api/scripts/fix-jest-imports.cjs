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
  
  // Replace Jest imports with Vitest
  if (content.includes('@jest/globals')) {
    // Extract what's being imported from @jest/globals
    const jestImportMatch = content.match(/import\s+{([^}]+)}\s+from\s+['"]@jest\/globals['"]/);
    
    if (jestImportMatch) {
      const importedItems = jestImportMatch[1].split(',').map(item => item.trim());
      
      // Replace with vitest imports
      content = content.replace(
        /import\s+{[^}]+}\s+from\s+['"]@jest\/globals['"]/,
        `import { ${importedItems.join(', ')} } from 'vitest'`
      );
      
      // Replace jest.fn() with vi.fn() etc.
      content = content.replace(/jest\./g, 'vi.');
      
      // Write the modified file
      fs.writeFileSync(filePath, content, 'utf8');
      modifiedCount++;
      console.log(`Fixed Jest imports in: ${filePath}`);
    }
  }
});

console.log(`Successfully modified ${modifiedCount} files`);