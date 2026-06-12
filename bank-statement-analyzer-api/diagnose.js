console.log('🔍 Running diagnostics...\n');

// Check for problematic files
import { promises as fs } from 'fs';
import path from 'path';

async function findProblems() {
  console.log('Checking for duplicate model files...');
  
  const problemFiles = [];
  
  async function checkDir(dir) {
    try {
      const files = await fs.readdir(dir, { withFileTypes: true });
      
      for (const file of files) {
        const fullPath = path.join(dir, file.name);
        
        if (file.isDirectory() && !file.name.includes('node_modules')) {
          await checkDir(fullPath);
        } else if (file.name.endsWith('.model.js')) {
          problemFiles.push(fullPath);
        }
      }
    } catch {
      // Ignore
    }
  }
  
  await checkDir('./src');
  
  if (problemFiles.length > 0) {
    console.log('\n Found problematic files:');
    problemFiles.forEach(f => console.log(`  - ${f}`));
    console.log('\nThese should be renamed or removed.');
  } else {
    console.log(' No .model.js files found');
  }
  
  // Check imports
  console.log('\nChecking for bad imports...');
  const badImports = [];
  
  async function checkImports(dir) {
    try {
      const files = await fs.readdir(dir, { withFileTypes: true });
      
      for (const file of files) {
        const fullPath = path.join(dir, file.name);
        
        if (file.isDirectory() && !file.name.includes('node_modules')) {
          await checkImports(fullPath);
        } else if (file.name.endsWith('.js')) {
          const content = await fs.readFile(fullPath, 'utf8');
          if (content.includes('.model.js')) {
            badImports.push(fullPath);
          }
        }
      }
    } catch {
      // Ignore
    }
  }
  
  await checkImports('./src');
  
  if (badImports.length > 0) {
    console.log('\n❌ Files with bad imports:');
    badImports.forEach(f => console.log(`  - ${f}`));
  } else {
    console.log('✅ No bad imports found');
  }
}

await findProblems();
