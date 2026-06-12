import fs from 'fs/promises';
import { glob } from 'glob';

const patterns = [
  // Remove entire beforeAll/afterAll blocks with mongoose operations
  /beforeAll\s*\(\s*async\s*\(\)\s*=>\s*\{[\s\S]*?(mongoose\.connect|MongoMemoryServer|setupTestDatabase)[\s\S]*?\}\s*\)/g,
  /afterAll\s*\(\s*async\s*\(\)\s*=>\s*\{[\s\S]*?(mongoose\.disconnect|mongoServer\.stop|teardownTestDatabase)[\s\S]*?\}\s*\)/g,
  
  // Remove setupTestDatabase and teardownTestDatabase function calls
  /await\s+setupTestDatabase\(\);?\s*\n?/g,
  /await\s+teardownTestDatabase\(\);?\s*\n?/g,
  
  // Remove MongoMemoryServer variable declarations
  /let\s+mongoServer\s*;?\s*\n?/g,
  /const\s+mongoServer\s*=.*;\s*\n?/g,
  
  // Remove imports that are no longer needed
  /import\s*{\s*MongoMemoryServer\s*}\s*from\s*['"]mongodb-memory-server['"];?\s*\n/g,
  /import\s*{\s*setupTestDatabase,?\s*teardownTestDatabase\s*}\s*from.*;\s*\n/g,
];

async function fixMongoConnections() {
  const testFiles = await glob(['tests/**/*.test.js', 'src/**/*.test.js'], {
    ignore: ['**/node_modules/**', 'tests/setup.js']
  });
  
  console.log(`Found ${testFiles.length} test files to check`);
  
  for (const file of testFiles) {
    try {
      let content = await fs.readFile(file, 'utf8');
      let originalContent = content;
      
      // Apply all patterns
      for (const pattern of patterns) {
        content = content.replace(pattern, '');
      }
      
      // Clean up extra blank lines
      content = content.replace(/\n{3,}/g, '\n\n');
      
      if (content !== originalContent) {
        await fs.writeFile(file, content);
        console.log(`✅ Fixed: ${file}`);
      }
    } catch (error) {
      console.error(`❌ Error processing ${file}:`, error.message);
    }
  }
}

fixMongoConnections().catch(console.error);