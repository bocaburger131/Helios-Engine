// cleanup-jest-imports.js
import fs from 'fs/promises';
import path from 'path';
import { glob } from 'glob';

// This regular expression finds any line that contains an import from '@jest/globals'
// and removes the entire line, including the newline character.
const jestImportRegex = /^.*import\s+\{.*\}\s+from\s+'@jest\/globals';.*\r?\n?/gm;

async function refactorFiles() {
  console.log('Scanning for test files to refactor...');

  // Use glob to find all .js and .mjs files inside the /tests directory
  const files = await glob('tests/**/*.{js,mjs}');

  if (files.length === 0) {
    console.log('No matching files found in the /tests directory.');
    return;
  }

  let filesChanged = 0;

  // Loop through each file found
  for (const file of files) {
    const filePath = path.resolve(file);
    try {
      let content = await fs.readFile(filePath, 'utf8');

      // Check if the file contains the target import
      if (jestImportRegex.test(content)) {
        // Create the new content by removing the matched lines
        const newContent = content.replace(jestImportRegex, '');

        // Write the changes back to the file
        await fs.writeFile(filePath, newContent, 'utf8');
        console.log(`✅ Updated: ${filePath}`);
        filesChanged++;
      }
    } catch (err) {
        console.error(`❌ Failed to process ${filePath}:`, err);
    }
  }

  console.log(`\nRefactoring complete. Updated ${filesChanged} files.`);
}

// Run the main function
refactorFiles();