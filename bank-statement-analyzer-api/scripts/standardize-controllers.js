import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const controllersDir = path.join(__dirname, '..', 'src', 'controllers');

/**
 * Converts traditional methods to arrow functions in controller files
 */
function standardizeControllers() {
  console.log('Standardizing controllers to use arrow functions...\n');
  
  const files = fs.readdirSync(controllersDir);
  let modifiedFiles = 0;
  
  for (const file of files) {
    if (file.endsWith('.js')) {
      const filePath = path.join(controllersDir, file);
      let content = fs.readFileSync(filePath, 'utf8');
      
      // Check if there are any traditional methods to convert
      const traditionalMethodPattern = /\s+(async\s+)([a-zA-Z0-9_]+)\s*\(([^)]*)\)\s*{/g;
      let matches = [...content.matchAll(traditionalMethodPattern)];
      
      if (matches.length > 0) {
        console.log(`🔧 Converting methods in ${file}...`);
        
        // For each traditional method, convert to arrow function
        for (const match of matches) {
          const [fullMatch, asyncKeyword, methodName, params] = match;
          
          // Create the arrow function version
          const arrowVersion = `  ${methodName} = ${asyncKeyword}(${params}) => {`;
          
          // Replace in content
          content = content.replace(fullMatch, arrowVersion);
          console.log(`  ✓ Converted: ${methodName}`);
        }
        
        // Write updated content back to file
        fs.writeFileSync(filePath, content);
        modifiedFiles++;
      }
    }
  }
  
  console.log(`\n✅ Standardization complete. Modified ${modifiedFiles} files.`);
  console.log('Run npm run analyze:controllers to verify the changes.');
}

// Run the standardization
standardizeControllers();