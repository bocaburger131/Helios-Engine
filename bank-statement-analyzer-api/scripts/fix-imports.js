import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Get the directory name in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Project root directory
const rootDir = path.resolve(__dirname, '..');
const srcDir = path.join(rootDir, 'src');

// List of directories to exclude
const excludeDirs = ['node_modules', 'dist', 'coverage', '.git'];

// Function to walk through directory and get all JS files
function getAllJsFiles(dir, fileList = []) {
  const files = fs.readdirSync(dir);
  
  files.forEach(file => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    
    if (stat.isDirectory()) {
      // Skip excluded directories
      if (!excludeDirs.includes(file)) {
        getAllJsFiles(filePath, fileList);
      }
    } else if (file.endsWith('.js') && !file.endsWith('.test.js')) {
      fileList.push(filePath);
    }
  });
  
  return fileList;
}

// Get all JS files
const jsFiles = getAllJsFiles(srcDir);
console.log(`Found ${jsFiles.length} JavaScript files to process`);

// Track changes
const changes = {
  addedJsExtension: 0,
  fixedExportImport: 0,
  filesChanged: 0
};

// Process each file
jsFiles.forEach(filePath => {
  let fileContent = fs.readFileSync(filePath, 'utf8');
  let fileChanged = false;
  
  // 1. Add .js extension to local imports
  const importRegex = /import\s+(?:(?:{[^}]*})|(?:[^{}\s,]+))?\s*(?:from\s+)?['"]([^'"./][^'"]*|\.\.?\/[^'"]*)['"]/g;
  
  let match;
  while ((match = importRegex.exec(fileContent)) !== null) {
    const importPath = match[1];
    
    // Only process relative imports
    if (importPath.startsWith('.') && !importPath.endsWith('.js')) {
      const newImportPath = `${importPath}.js`;
      const oldImport = match[0];
      const newImport = oldImport.replace(importPath, newImportPath);
      
      fileContent = fileContent.replace(oldImport, newImport);
      changes.addedJsExtension++;
      fileChanged = true;
    }
  }
  
  // 2. Check for export/import mismatches
  
  // Find all exports in the file
  const defaultExportRegex = /export\s+default\s+([A-Za-z0-9_]+)/g;
  const namedExportRegex = /export\s+const\s+([A-Za-z0-9_]+)/g;
  
  const defaultExports = [];
  const namedExports = [];
  
  while ((match = defaultExportRegex.exec(fileContent)) !== null) {
    defaultExports.push(match[1]);
  }
  
  while ((match = namedExportRegex.exec(fileContent)) !== null) {
    namedExports.push(match[1]);
  }
  
  // Find file basename to check against imports in other files
  const fileBasename = path.basename(filePath, '.js');
  
  // Save changes if any
  if (fileChanged) {
    fs.writeFileSync(filePath, fileContent);
    changes.filesChanged++;
    console.log(`✓ Fixed imports in ${filePath}`);
  }
});

// Now check for export/import mismatches across files
jsFiles.forEach(filePath => {
  let fileContent = fs.readFileSync(filePath, 'utf8');
  let fileChanged = false;
  
  // Find all imports
  const defaultImportRegex = /import\s+([A-Za-z0-9_]+)\s+from\s+['"]([^'"]*)['"]/g;
  const namedImportRegex = /import\s+{\s*([A-Za-z0-9_,\s]+)\s*}\s+from\s+['"]([^'"]*)['"]/g;
  
  let match;
  while ((match = defaultImportRegex.exec(fileContent)) !== null) {
    const importName = match[1];
    const importPath = match[2];
    
    // If this is a local import, check the exported file
    if (importPath.startsWith('.')) {
      const importPathWithoutExt = importPath.endsWith('.js') ? 
        importPath.slice(0, -3) : importPath;
      
      // Get the absolute path of the imported file
      const importedFilePath = path.resolve(path.dirname(filePath), `${importPathWithoutExt}.js`);
      
      // If the file exists, check its exports
      if (fs.existsSync(importedFilePath)) {
        const importedContent = fs.readFileSync(importedFilePath, 'utf8');
        
        // Check if the file has a default export
        const hasDefaultExport = /export\s+default/.test(importedContent);
        
        // If no default export but we're using default import, fix it
        if (!hasDefaultExport && /export\s+const\s+(\w+)/.test(importedContent)) {
          // Get the named export that matches our import
          const namedExportMatch = new RegExp(`export\\s+const\\s+(${importName})\\s*=`).exec(importedContent);
          
          if (namedExportMatch) {
            // Convert default import to named import
            const oldImport = match[0];
            const newImport = `import { ${importName} } from '${importPath}'`;
            
            fileContent = fileContent.replace(oldImport, newImport);
            fileChanged = true;
            changes.fixedExportImport++;
          }
        }
      }
    }
  }
  
  // Save changes if any
  if (fileChanged) {
    fs.writeFileSync(filePath, fileContent);
    changes.filesChanged++;
    console.log(`✓ Fixed import/export mismatch in ${filePath}`);
  }
});

console.log('\nImport Fix Summary:');
console.log(`- Added .js extension to ${changes.addedJsExtension} imports`);
console.log(`- Fixed ${changes.fixedExportImport} export/import mismatches`);
console.log(`- Changed ${changes.filesChanged} files in total`);
console.log('\nDone!');