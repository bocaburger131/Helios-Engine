import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Get the directory name using ES modules approach
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// List of files that likely have MongoDB connection issues
const filesToFix = [
  'tests/api.test.js',
  'src/models/statement/statement.model.test.js',
  'tests/models/Statement.test.js',
  'tests/basic.test.js'
];

// Simple function to fix a test file
function fixTestFile(filePath) {
  try {
    // Check if file exists
    if (!fs.existsSync(filePath)) {
      console.log(`⚠️ File not found: ${filePath}`);
      return false;
    }
    
    console.log(`Processing ${filePath}...`);
    
    // Read the file
    const content = fs.readFileSync(filePath, 'utf8');
    
    // Create backup
    fs.writeFileSync(`${filePath}.bak`, content, 'utf8');
    
    // Calculate the relative path to the mongo-memory-server.js
    const relativePath = path.relative(path.dirname(filePath), 
                                     path.resolve('tests/setup/mongo-memory-server.js'))
                           .replace(/\\/g, '/');
    
    // Add import for the centralized MongoDB setup
    let fixedContent = `// MongoDB connection fix
import { connect, closeDatabase } from '${relativePath}';

// Set up test database
beforeAll(async () => await connect());
afterAll(async () => await closeDatabase());

${content}`;
    
    // Save the fixed file
    fs.writeFileSync(filePath, fixedContent, 'utf8');
    console.log(`✅ Fixed ${filePath}`);
    return true;
  } catch (error) {
    console.error(`❌ Error fixing ${filePath}:`, error);
    return false;
  }
}

// Main function
function main() {
  console.log('🔄 Starting MongoDB test fix...');
  
  let fixed = 0;
  let failed = 0;
  
  // Process each file
  for (const file of filesToFix) {
    const fullPath = path.resolve(file);
    if (fixTestFile(fullPath)) {
      fixed++;
    } else {
      failed++;
    }
  }
  
  console.log('\n===== Summary =====');
  console.log(`✅ Fixed files: ${fixed}`);
  console.log(`❌ Failed files: ${failed}`);
  console.log('====================');
}

// Run the main function
main();