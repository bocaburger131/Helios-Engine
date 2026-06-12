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

function checkJsExtensions() {
  const jsFiles = getAllJsFiles(srcDir);
  console.log(`Checking ${jsFiles.length} JavaScript files for missing .js extensions in imports...`);
  
  const missingExtensions = [];
  
  jsFiles.forEach(filePath => {
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n');
    
    lines.forEach((line, index) => {
      // More comprehensive regex to catch various import patterns
      if (line.trim().startsWith('import ') && line.includes(' from ')) {
        const match = /from\s+['"]([^'"]+)['"]/.exec(line);
        if (match) {
          const importPath = match[1];
          
          // Check if this is a relative import without .js extension
          if ((importPath.startsWith('./') || importPath.startsWith('../')) && 
              !importPath.includes('?') && // Skip URLs with query params
              !importPath.endsWith('.js') && 
              !importPath.endsWith('/') && // Skip directory imports
              !importPath.includes('*')) { // Skip wildcard imports
            
            missingExtensions.push({
              file: filePath,
              line: index + 1,
              import: line.trim(),
              path: importPath
            });
          }
        }
      }
    });
  });
  
  if (missingExtensions.length > 0) {
    console.log(`\nFound ${missingExtensions.length} imports missing .js extension:`);
    missingExtensions.forEach(({file, line, import: importStmt, path}) => {
      console.log(`${file}:${line} - ${importStmt}`);
      console.log(`  Consider changing to: from '${path}.js'`);
    });
  } else {
    console.log('No missing .js extensions found in imports!');
  }
}

checkJsExtensions();