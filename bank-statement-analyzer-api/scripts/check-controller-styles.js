import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const controllersDir = path.join(__dirname, '..', 'src', 'controllers');

function checkControllerStyles() {
  console.log('Checking controllers for consistent method styles...');
  const files = fs.readdirSync(controllersDir);
  
  let inconsistentFiles = 0;
  
  for (const file of files) {
    if (file.endsWith('.js')) {
      const filePath = path.join(controllersDir, file);
      const content = fs.readFileSync(filePath, 'utf8');
      
      // Look for traditional method definitions (without arrow functions)
      const traditionalMethodPattern = /\s+async\s+[a-zA-Z0-9_]+\s*\([^)]*\)\s*{/g;
      const arrowMethodPattern = /\s+[a-zA-Z0-9_]+\s*=\s*async\s*\([^)]*\)\s*=>/g;
      
      const traditionalMethods = content.match(traditionalMethodPattern) || [];
      const arrowMethods = content.match(arrowMethodPattern) || [];
      
      if (traditionalMethods.length > 0 && arrowMethods.length > 0) {
        console.log(`❌ ${file}: Mixed method styles detected`);
        console.log(`   Traditional methods: ${traditionalMethods.length}`);
        console.log(`   Arrow function methods: ${arrowMethods.length}`);
        
        // List the traditional methods that should be converted
        console.log('   Methods to convert:');
        const lines = content.split('\n');
        for (let i = 0; i < lines.length; i++) {
          if (lines[i].match(traditionalMethodPattern)) {
            console.log(`     Line ${i+1}: ${lines[i].trim()}`);
          }
        }
        
        inconsistentFiles++;
      } else if (traditionalMethods.length > 0) {
        console.log(`⚠️ ${file}: Using only traditional methods (${traditionalMethods.length})`);
        inconsistentFiles++;
      } else if (arrowMethods.length > 0) {
        console.log(`✅ ${file}: Using only arrow function methods (${arrowMethods.length})`);
      } else {
        console.log(`ℹ️ ${file}: No controller methods detected`);
      }
    }
  }
  
  if (inconsistentFiles > 0) {
    console.log(`\n⚠️ Found ${inconsistentFiles} files with inconsistent or traditional method styles`);
    console.log('Recommendation: Convert all methods to arrow functions for consistency');
  } else {
    console.log('\n✅ All controllers use consistent method styles');
  }
}

checkControllerStyles();