import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { glob } from 'glob';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function checkTestFiles() {
  const testFiles = await glob('tests/**/*.test.js', {
    cwd: path.join(__dirname, '..'),
    absolute: true
  });

  console.log(`Found ${testFiles.length} test files to check\n`);

  const errors = [];

  for (const file of testFiles) {
    try {
      const content = fs.readFileSync(file, 'utf-8');
      
      // Check for common syntax issues
      if (content.includes('```') || content.includes('````')) {
        errors.push({
          file,
          error: 'Contains markdown code block markers'
        });
      }
      
      // Try to parse as module
      try {
        await import(file);
      } catch (importError) {
        errors.push({
          file,
          error: importError.message
        });
      }
    } catch (readError) {
      errors.push({
        file,
        error: `Could not read file: ${readError.message}`
      });
    }
  }

  if (errors.length > 0) {
    console.log('Found errors in the following files:\n');
    errors.forEach(({ file, error }) => {
      console.log(`File: ${path.relative(path.join(__dirname, '..'), file)}`);
      console.log(`Error: ${error}\n`);
    });
  } else {
    console.log('All test files appear to have valid syntax!');
  }
}

checkTestFiles().catch(console.error);