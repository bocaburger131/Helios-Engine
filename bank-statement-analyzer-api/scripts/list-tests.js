import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

async function listTests() {
  console.log('🔍 Looking for test files...\n');
  
  async function findTests(dir) {
    const files = [];
    
    async function walk(currentDir) {
      try {
        const entries = await fs.readdir(currentDir, { withFileTypes: true });
        
        for (const entry of entries) {
          const fullPath = path.join(currentDir, entry.name);
          
          if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
            await walk(fullPath);
          } else if (entry.isFile() && entry.name.endsWith('.test.js')) {
            files.push(path.relative(rootDir, fullPath));
          }
        }
      } catch (error) {
        // Ignore errors from inaccessible directories
      }
    }
    
    await walk(dir);
    return files;
  }
  
  try {
    const testFiles = await findTests(path.join(rootDir, 'tests'));
    
    console.log(`Found ${testFiles.length} test files:`);
    testFiles.forEach(file => console.log(`  - ${file}`));
    
    // Group by directory
    const grouped = {};
    testFiles.forEach(file => {
      const dir = path.dirname(file);
      if (!grouped[dir]) grouped[dir] = [];
      grouped[dir].push(path.basename(file));
    });
    
    console.log('\n📁 Grouped by directory:');
    Object.entries(grouped).forEach(([dir, files]) => {
      console.log(`\n${dir}:`);
      files.forEach(file => console.log(`  - ${file}`));
    });
    
  } catch (error) {
    console.error('Error listing tests:', error);
  }
}

listTests();