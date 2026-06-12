import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const srcDir = path.join(rootDir, 'src');
const excludeDirs = ['node_modules', 'dist', 'coverage', '.git'];

function getAllJsFiles(dir, fileList = []) {
  const files = fs.readdirSync(dir);
  
  files.forEach(file => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    
    if (stat.isDirectory()) {
      if (!excludeDirs.includes(file)) {
        getAllJsFiles(filePath, fileList);
      }
    } else if (file.endsWith('.js')) {
      fileList.push(filePath);
    }
  });
  
  return fileList;
}

function fixJsExtensions() {
  const jsFiles = getAllJsFiles(srcDir);
  console.log(`Checking ${jsFiles.length} JavaScript files for missing .js extensions in imports...`);
  
  let fixedCount = 0;
  const fixedFiles = new Set();
  
  jsFiles.forEach(filePath => {
    let content = fs.readFileSync(filePath, 'utf8');
    const originalContent = content;
    
    // Find all import statements with relative paths
    const importRegex = /import\s+(?:{[^}]*}|[^{}\s,]+)?\s*(?:from\s+)?['"](\.[^'"]*)['"]/g;
    let match;
    let fileModified = false;
    
    // Collect all matches first to avoid regex index issues when replacing
    const matches = [];
    while ((match = importRegex.exec(originalContent)) !== null) {
      matches.push(match);
    }
    
    // Process the matches in reverse order to avoid position shifts
    for (let i = matches.length - 1; i >= 0; i--) {
      const match = matches[i];
      const importPath = match[1];
      
      // Skip if the path already has .js, is a directory import, or contains wildcards
      if (!importPath.endsWith('.js') && 
          !importPath.endsWith('/') && 
          !importPath.includes('*') &&
          !importPath.includes('?')) {
        
        // Find the exact string to replace
        const fullMatch = match[0];
        const startIdx = match.index;
        const endIdx = startIdx + fullMatch.length;
        
        // Replace the import path with the .js extension
        const newImport = fullMatch.replace(`"${importPath}"`, `"${importPath}.js"`)
                                  .replace(`'${importPath}'`, `'${importPath}.js'`);
        
        content = content.substring(0, startIdx) + newImport + content.substring(endIdx);
        
        fixedCount++;
        fileModified = true;
      }
    }
    
    if (fileModified) {
      fs.writeFileSync(filePath, content);
      fixedFiles.add(filePath);
      console.log(`✓ Fixed imports in ${filePath}`);
    }
  });
  
  console.log(`\nFixed ${fixedCount} imports across ${fixedFiles.size} files`);
}

fixJsExtensions();