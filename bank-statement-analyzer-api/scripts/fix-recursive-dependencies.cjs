const fs = require('fs');
const path = require('path');
const glob = require('glob');

// Get all source files
const sourceFiles = glob.sync('src/**/*.js');

// Track files that have been processed
const processedFiles = new Set();
let fixedCount = 0;

// Process a file and its imports recursively
function processFile(filePath) {
  if (processedFiles.has(filePath)) {
    return;
  }
  
  processedFiles.add(filePath);
  
  try {
    let content = fs.readFileSync(filePath, 'utf8');
    let modified = false;
    
    // Find all imports
    const importRegex = /import\s+(?:{[^}]*}|\w+|\*\s+as\s+\w+)\s+from\s+['"]([^'"]+)['"]/g;
    let match;
    
    while ((match = importRegex.exec(content)) !== null) {
      const importPath = match[1];
      
      // Handle @/ imports
      if (importPath.startsWith('@/')) {
        // Fix @/errors imports
        if (importPath === '@/errors') {
          content = content.replace(/['"]@\/errors['"]/g, '"@/utils/errors.js"');
          modified = true;
        }
        
        // Add .js extension if missing
        if (!importPath.endsWith('.js')) {
          content = content.replace(
            new RegExp(`from\\s+['"]${importPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}['"]`, 'g'),
            `from '${importPath}.js'`
          );
          modified = true;
        }
        
        // Process the imported file recursively
        const resolvedImportPath = path.resolve('src', importPath.slice(2));
        if (fs.existsSync(resolvedImportPath)) {
          processFile(resolvedImportPath);
        } else if (fs.existsSync(resolvedImportPath + '.js')) {
          processFile(resolvedImportPath + '.js');
        }
      }
      
      // Handle relative imports
      if (importPath.startsWith('./') || importPath.startsWith('../')) {
        // Add .js extension if missing
        if (!importPath.endsWith('.js')) {
          content = content.replace(
            new RegExp(`from\\s+['"]${importPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}['"]`, 'g'),
            `from '${importPath}.js'`
          );
          modified = true;
        }
        
        // Process the imported file recursively
        const resolvedImportPath = path.resolve(path.dirname(filePath), importPath);
        if (fs.existsSync(resolvedImportPath)) {
          processFile(resolvedImportPath);
        } else if (fs.existsSync(resolvedImportPath + '.js')) {
          processFile(resolvedImportPath + '.js');
        }
      }
    }
    
    // Save changes if modified
    if (modified) {
      fs.writeFileSync(filePath, content, 'utf8');
      fixedCount++;
      console.log(`Fixed imports in: ${filePath}`);
    }
  } catch (error) {
    console.error(`Error processing file ${filePath}: ${error.message}`);
  }
}

// Start with app.js as the entry point
const appFilePath = path.resolve(__dirname, '../src/app.js');
processFile(appFilePath);

console.log(`\nSuccessfully fixed imports in ${fixedCount} files`);