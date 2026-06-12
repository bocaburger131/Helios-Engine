import fs from 'fs/promises';
import path from 'path';
import { glob } from 'glob';

const patterns = [
  /beforeAll\s*\(\s*async\s*\(\)\s*=>\s*\{[\s\S]*?mongoose\.connect[\s\S]*?\}\s*\)/g,
  /beforeAll\s*\(\s*async\s*\(\)\s*=>\s*\{[\s\S]*?MongoMemoryServer\.create[\s\S]*?\}\s*\)/g,
  /afterAll\s*\(\s*async\s*\(\)\s*=>\s*\{[\s\S]*?mongoose\.disconnect[\s\S]*?\}\s*\)/g,
  /afterAll\s*\(\s*async\s*\(\)\s*=>\s*\{[\s\S]*?mongoServer\.stop[\s\S]*?\}\s*\)/g,
];

async function cleanupTestFiles() {
  const testFiles = await glob(['tests/**/*.test.js', 'src/**/*.test.js']);
  
  for (const file of testFiles) {
    let content = await fs.readFile(file, 'utf8');
    let modified = false;
    
    for (const pattern of patterns) {
      if (pattern.test(content)) {
        content = content.replace(pattern, '');
        modified = true;
      }
    }
    
    // Remove MongoMemoryServer imports if no longer used
    if (!content.includes('MongoMemoryServer') && content.includes("import { MongoMemoryServer }")) {
      content = content.replace(/import\s*{\s*MongoMemoryServer\s*}\s*from\s*['"]mongodb-memory-server['"];?\s*\n/g, '');
      modified = true;
    }
    
    if (modified) {
      await fs.writeFile(file, content);
      console.log(`✅ Cleaned up: ${file}`);
    }
  }
}

cleanupTestFiles().catch(console.error);