// fix-import-paths.js - ES modules version
import fs from 'fs/promises';
import path from 'path';
import { glob } from 'glob';
import { fileURLToPath } from 'url';

// Get the current file's directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// This regex finds imports using various patterns that might need fixing
const problematicImportRegex = /import\s+(?:{[^}]+}|\*\s+as\s+[^;]+|[^;{]+)\s+from\s+['"]([^'"]+)['"]/g;

async function fixImports() {
  console.log('Scanning test files for problematic imports...');
  
  try {
    const files = await glob('tests/**/*.js');
    console.log(`Found ${files.length} test files to check.`);
    
    if (files.length === 0) {
      console.log('No test files found.');
      return;
    }
    
    let filesChanged = 0;
    
    for (const file of files) {
      const filePath = path.resolve(file);
      try {
        console.log(`\nChecking file: ${file}`);
        const content = await fs.readFile(filePath, 'utf8');
        let newContent = content;
        let fileModified = false;
        
        // Calculate relative path from test file to src
        const relPath = path.relative(path.dirname(filePath), path.resolve('src')).replace(/\\/g, '/');
        
        // Find all import statements
        const imports = [...content.matchAll(problematicImportRegex)];
        
        for (const match of imports) {
          const fullImport = match[0];
          const importPath = match[1];
          
          // Check for @/ pattern
          if (importPath.startsWith('@/')) {
            const pathWithoutAlias = importPath.substring(2);
            let correctedPath = `${relPath}/${pathWithoutAlias}`;
            
            // Add .js extension if missing and not a directory/index
            if (!correctedPath.endsWith('.js') && !correctedPath.endsWith('/')) {
              correctedPath += '.js';
            }
            
            const newImport = fullImport.replace(importPath, correctedPath);
            console.log(`  Replacing: ${fullImport}`);
            console.log(`  With:      ${newImport}`);
            
            newContent = newContent.replace(fullImport, newImport);
            fileModified = true;
          }
          // Here you can add more patterns to fix if needed
        }
        
        if (fileModified) {
          await fs.writeFile(filePath, newContent, 'utf8');
          console.log(`✅ Updated: ${filePath}`);
          filesChanged++;
        } else {
          console.log(`  No changes needed for ${file}`);
        }
      } catch (err) {
        console.error(`❌ Failed to process ${file}:`, err);
      }
    }
    
    console.log(`\nFixed imports in ${filesChanged} files.`);
  } catch (error) {
    console.error('Error scanning files:', error);
  }
}

// Run the function
fixImports();