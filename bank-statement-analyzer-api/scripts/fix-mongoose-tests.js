// scripts/fix-mongoose-tests.js
import fs from 'fs/promises';
import path from 'path';
import { glob } from 'glob';

// This regex finds beforeAll/afterAll blocks. It handles multiple lines.
const hookRegex = /(beforeAll|afterAll)\s*\([\s\S]*?\}\);?/g;

// Keywords that identify a block as a database connection hook to be removed.
const dbKeywords = ['mongoose.connect', 'MongoMemoryServer.create', 'global.connectDB', 'setupTestDatabase', 'disconnectDB', 'connectTestDB'];

async function refactorFiles() {
  console.log('🚀 Scanning for test files with redundant MongoDB connections...');
  
  // Find all .test.js files in both the /src and /tests directories
  const files = await glob('{src,tests}/**/*.test.js');

  if (files.length === 0) {
    console.log('No test files found.');
    return;
  }

  let filesChanged = 0;

  for (const file of files) {
    const filePath = path.resolve(file);
    try {
      let content = await fs.readFile(filePath, 'utf8');
      const originalContent = content;

      // Use a replacer function to inspect each matched hook
      content = content.replace(hookRegex, (matchedBlock) => {
        // Check if the block contains any of our database keywords
        const isDbHook = dbKeywords.some(keyword => matchedBlock.includes(keyword));
        
        if (isDbHook) {
          console.log(`  - Found a database hook to comment out in: ${path.basename(filePath)}`);
          // If it's a DB hook, wrap it in block comments
          return `/* --- AUTOMATED CLEANUP: This block was removed by fix-mongoose-tests.js ---\n${matchedBlock}\n*/`; 
        } else {
          // Otherwise, leave the block untouched
          return matchedBlock;
        }
      });

      // Only write to the file if changes were actually made
      if (originalContent !== content) {
        await fs.writeFile(filePath, content, 'utf8');
        filesChanged++;
      }

    } catch (error) {
      console.error(`❌ Failed to process ${filePath}:`, error);
    }
  }

  console.log(`\n✅ Cleanup complete. Processed ${files.length} files and updated ${filesChanged}.`);
  if (filesChanged > 0) {
    console.log("\nNext Steps: Please open the modified files, review the commented-out blocks, and delete them if correct.");
  }
}

// Run the main function
refactorFiles();