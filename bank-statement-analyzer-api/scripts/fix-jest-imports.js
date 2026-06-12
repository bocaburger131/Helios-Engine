import fs from 'fs';
import path from 'path';
import pkg from 'glob';
const { glob } = pkg;

async function fixJestImports() {
  // Find all test files
  const testFiles = await glob('tests/**/*.test.js');
  
  console.log(`Found ${testFiles.length} test files to check`);
  
  let fixedCount = 0;
  
  for (const filePath of testFiles) {
    const content = fs.readFileSync(filePath, 'utf8');
    
    // Check if file imports from @jest/globals
    if (content.includes('@jest/globals')) {
      // Replace jest imports with vitest imports
      const fixed = content.replace(
        /import\s+{([^}]+)}\s+from\s+['"]@jest\/globals['"]/g, 
        'import {$1} from "../helpers/jest-compat.js"'
      );
      
      // Write the fixed content back
      fs.writeFileSync(filePath, fixed, 'utf8');
      fixedCount++;
      console.log(`Fixed imports in ${filePath}`);
    }
  }
  
  console.log(`Fixed ${fixedCount} files`);
}

fixJestImports().catch(console.error);