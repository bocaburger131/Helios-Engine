// scripts/fix-mongoose-connections.cjs

const fs = require('fs');
const path = require('path');
const { globSync } = require('glob');

// This regex finds beforeAll/afterAll blocks containing mongoose.connect or global.connectDB
const mongoHookRegex = /(beforeAll|afterAll)\s*\([\s\S]*?(mongoose\.connect|global\.connectDB)[\s\S]*?\}\);?/g;

function refactorFiles() {
  console.log('Scanning for test files with local MongoDB connections...');
  
  // Find all .test.js files in both /tests and /src directories
  const files = globSync(['tests/**/*.test.js', 'src/**/*.test.js', '**/*.test.js']);

  if (files.length === 0) {
    console.log('No test files found.');
    return;
  }

  let filesChanged = 0;

  for (const file of files) {
    const filePath = path.resolve(file);
    try {
      let content = fs.readFileSync(filePath, 'utf8');

      // Check if the file contains the problematic hooks
      if (mongoHookRegex.test(content)) {
        // Reset regex state
        mongoHookRegex.lastIndex = 0;
        
        // Create backup
        fs.writeFileSync(`${filePath}.bak`, content, 'utf8');
        
        // Create the new content by removing the matched blocks
        const newContent = content.replace(mongoHookRegex, '');
        
        fs.writeFileSync(filePath, newContent, 'utf8');
        console.log(` Cleaned up: ${file}`);
        filesChanged++;
      }
    } catch (err) {
      console.error(` Failed to process ${file}:`, err);
    }
  }

  console.log(`\nCleanup complete. Updated ${filesChanged} files.`);
}

// Run the main function
refactorFiles();
