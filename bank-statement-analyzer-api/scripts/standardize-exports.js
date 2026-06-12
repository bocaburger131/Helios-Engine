// scripts/standardize-exports.js
import fs from 'fs/promises';
import path from 'path';
import { glob } from 'glob';

const CJS_EXPORT_REGEX = /module\.exports\s*=\s*new\s+([A-Z]\w+)\(\);?/g;
const OBJECT_EXPORT_REGEX = /export\s+const\s+([A-Z]\w+)\s*=\s*\{/;

async function refactorFiles() {
  console.log('🚀 Scanning for controllers and services to standardize...');
  
  const files = await glob('src/{controllers,services}/**/*.js');
  let filesChanged = 0;

  for (const file of files) {
    if (file.includes('.test.')) continue;
    
    try {
      let content = await fs.readFile(file, 'utf8');
      const originalContent = content;
      let className = '';

      // --- Fix Pattern 1: `export const Controller = {}` -> `class Controller ...` ---
      if (OBJECT_EXPORT_REGEX.test(content)) {
        const match = content.match(OBJECT_EXPORT_REGEX);
        className = match[1];
        
        // Replace the export with a class declaration
        content = content.replace(OBJECT_EXPORT_REGEX, `class ${className} {`);
        // Find the closing brace and append the default export
        content = content.replace(/(\n\s*};?\s*)$/, `\n}\n\nexport default new ${className}();`);
      }

      // --- Fix Pattern 2: `module.exports = new ...` -> `export default new ...` ---
      else if (CJS_EXPORT_REGEX.test(content)) {
         const match = content.match(CJS_EXPORT_REGEX);
         className = match[1];
         content = content.replace(CJS_EXPORT_REGEX, `export default new ${className}();`);
      }

      if (originalContent !== content) {
        await fs.writeFile(file, content, 'utf8');
        console.log(`✅ Standardized export in: ${file}`);
        filesChanged++;
      }

    } catch (error) {
      console.error(`❌ Error processing file ${file}:`, error);
    }
  }

  console.log(`\nRefactoring complete. Updated ${filesChanged} files.`);
  if (filesChanged > 0) {
    console.log("\nNext, please review the changes and fix the corresponding 'import' statements in your test files.");
  } else {
    console.log("\nNo files needed refactoring. Your source file exports are likely correct already.");
  }
}

run();
