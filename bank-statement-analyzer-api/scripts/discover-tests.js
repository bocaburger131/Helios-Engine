import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { glob } from 'glob';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

async function discoverTests() {
  console.log('🔍 Discovering all test files...\n');

  try {
    // Find all test files using glob
    const testFiles = await glob('**/*.test.js', {
      cwd: rootDir,
      ignore: ['node_modules/**', 'coverage/**', 'dist/**'],
      absolute: false
    });

    console.log(`Found ${testFiles.length} test files total:\n`);

    // Group by directory
    const byDirectory = {};
    testFiles.forEach(file => {
      const dir = path.dirname(file);
      if (!byDirectory[dir]) byDirectory[dir] = [];
      byDirectory[dir].push(path.basename(file));
    });

    // Display grouped results
    Object.entries(byDirectory).forEach(([dir, files]) => {
      console.log(`📁 ${dir}/`);
      files.forEach(file => console.log(`   - ${file}`));
      console.log('');
    });

    // Check if files can be imported
    console.log('\n🧪 Checking test file validity...\n');
    
    for (const file of testFiles.slice(0, 10)) { // Check first 10 files
      const fullPath = path.join(rootDir, file);
      try {
        const content = await fs.readFile(fullPath, 'utf-8');
        if (content.includes('```') || content.includes('````')) {
          console.log(`❌ ${file} - Contains markdown code blocks`);
        } else if (content.trim().length === 0) {
          console.log(`❌ ${file} - Empty file`);
        } else {
          console.log(`✅ ${file} - Appears valid`);
        }
      } catch (error) {
        console.log(`❌ ${file} - Error: ${error.message}`);
      }
    }

  } catch (error) {
    console.error('Error discovering tests:', error);
  }
}

discoverTests();