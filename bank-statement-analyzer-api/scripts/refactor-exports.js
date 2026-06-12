// scripts/refactor-exports.js
import fs from 'fs/promises';
import path from 'path';
import { glob } from 'glob';
import mongoose from 'mongoose';

// Regex to find `module.exports = new ClassName()`
const cjsExportRegex = /module\.exports\s*=\s*new\s+([A-Z]\w+)\(\);?/g;

// Regex to find `export const ClassName = {`
const objectExportRegex = /export\s+const\s+([A-Z]\w+)\s*=\s*\{/;

async function refactorFiles() {
  console.log('🚀 Scanning for controllers and services to refactor to standard ESM classes...');
  
  const files = await glob('src/{controllers,services}/**/*.js');
  let filesChanged = 0;

  for (const file of files) {
    // Skip test files, just in case
    if (file.includes('.test.') || file.includes('.spec.')) continue;
    
    try {
      let content = await fs.readFile(file, 'utf8');
      const originalContent = content;

      let className = null;

      // --- Fix Pattern 1: Convert `export const Controller = {}` to a class ---
      if (objectExportRegex.test(content)) {
        const match = content.match(objectExportRegex);
        className = match[1];
        
        // Replace the export line with a class declaration
        content = content.replace(objectExportRegex, `class ${className} {`);
        // Find the closing brace of the object and append the default export
        content = content.replace(/(\n\s*};?\s*)$/, `\n}\n\nexport default new ${className}();`);
      }

      // --- Fix Pattern 2: Convert `module.exports = new ...` to ESM ---
      if (cjsExportRegex.test(content)) {
         const match = content.match(cjsExportRegex);
         className = match[1];
         content = content.replace(cjsExportRegex, `export default new ${className}();`);
      }

      if (originalContent !== content) {
        await fs.writeFile(file, content, 'utf8');
        console.log(`✅ Refactored: ${file}`);
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
    console.log("\nNo files needed refactoring. Your source files are likely correct already.");
  }
}

// Run the refactor function
async function run() {
  try {
    await refactorFiles();
  } catch (err) {
    console.error('Refactoring failed:', err);
    process.exit(1);
  }
}

// Database utility functions - moved to a separate file
// These will be exported from a different file in tests/setup

run();