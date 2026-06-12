// check-imports.js - ES modules version
import fs from 'fs/promises';
import path from 'path';
import { glob } from 'glob';

async function checkImports() {
  console.log('Scanning test files for import patterns...');
  
  try {
    const files = await glob('tests/**/*.js');
    console.log(`Found ${files.length} test files.`);
    
    const importPatterns = {};
    
    for (const file of files) {
      try {
        const content = await fs.readFile(file, 'utf8');
        
        // Find all import statements
        const imports = content.match(/import\s+(?:{[^}]+}|\*\s+as\s+[^;]+|[^;{]+)\s+from\s+['"]([^'"]+)['"]/g) || [];
        
        if (imports.length > 0) {
          console.log(`\nFile: ${file}`);
          console.log(`Found ${imports.length} imports:`);
          
          imports.forEach(importStmt => {
            console.log(`  ${importStmt}`);
            
            // Extract the path part
            const pathMatch = importStmt.match(/from\s+['"]([^'"]+)['"]/);
            if (pathMatch && pathMatch[1]) {
              const importPath = pathMatch[1];
              importPatterns[importPath] = (importPatterns[importPath] || 0) + 1;
            }
          });
        }
      } catch (err) {
        console.error(`Error reading file ${file}:`, err.message);
      }
    }
    
    console.log('\nSummary of import patterns:');
    Object.entries(importPatterns)
      .sort((a, b) => b[1] - a[1])
      .forEach(([pattern, count]) => {
        console.log(`  ${pattern}: ${count} occurrences`);
      });
    
  } catch (error) {
    console.error('Error scanning imports:', error);
  }
}

// Run the function
checkImports();