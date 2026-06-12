import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const srcDir = path.join(rootDir, 'src');

function getAllJsFiles(dir, fileList = []) {
  const files = fs.readdirSync(dir);
  
  files.forEach(file => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    
    if (stat.isDirectory()) {
      if (!['node_modules', 'dist', 'coverage', '.git'].includes(file)) {
        getAllJsFiles(filePath, fileList);
      }
    } else if (file.endsWith('.js')) {
      fileList.push(filePath);
    }
  });
  
  return fileList;
}

function analyzeExports(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  
  const exports = {
    defaultExport: null,
    namedExports: []
  };
  
  // Check for default export
  const defaultExportMatch = /export\s+default\s+(\w+)/.exec(content);
  if (defaultExportMatch) {
    exports.defaultExport = defaultExportMatch[1];
  }
  
  // Check for named exports
  const namedExportRegex = /export\s+const\s+(\w+)/g;
  let match;
  while ((match = namedExportRegex.exec(content)) !== null) {
    exports.namedExports.push(match[1]);
  }
  
  return exports;
}

function resolveImportPath(sourcePath, importPath) {
  // Handle .js extension
  if (!importPath.endsWith('.js')) {
    importPath = `${importPath}.js`;
  }
  
  // Convert to relative path from src directory
  const sourceDir = path.dirname(sourcePath);
  const absolutePath = path.resolve(sourceDir, importPath);
  const relativePath = path.relative(srcDir, absolutePath).replace(/\\/g, '/');
  
  return relativePath;
}

function mapImportsToExports() {
  const jsFiles = getAllJsFiles(srcDir);
  console.log(`Analyzing ${jsFiles.length} JavaScript files for import/export patterns...`);
  
  // Build a map of file paths to their exports
  const exportMap = {};
  jsFiles.forEach(filePath => {
    const relativePath = path.relative(srcDir, filePath).replace(/\\/g, '/');
    exportMap[relativePath] = analyzeExports(filePath);
  });
  
  // Check imports against exports
  const mismatches = [];
  
  jsFiles.forEach(filePath => {
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n');
    
    lines.forEach((line, index) => {
      if (line.trim().startsWith('import ') && line.includes(' from ')) {
        // Check default imports
        const defaultImportMatch = /import\s+(\w+)\s+from\s+['"]([^'"]+)['"]/.exec(line);
        if (defaultImportMatch) {
          const importName = defaultImportMatch[1];
          const importPath = defaultImportMatch[2];
          
          // Only check local imports
          if (importPath.startsWith('.')) {
            // Resolve the imported file path
            const importedFile = resolveImportPath(filePath, importPath);
            
            // Check if the imported file has a default export
            if (importedFile && exportMap[importedFile]) {
              if (!exportMap[importedFile].defaultExport) {
                mismatches.push({
                  file: filePath,
                  line: index + 1,
                  import: line.trim(),
                  importedFile,
                  issue: `Default import used but no default export found in ${importedFile}`,
                  suggestion: `Use named import: import { ${importName} } from '${importPath}'`
                });
              }
            }
          }
        }
        
        // Check named imports
        const namedImportMatch = /import\s+{\s*([^}]+)\s*}\s+from\s+['"]([^'"]+)['"]/.exec(line);
        if (namedImportMatch) {
          const importNames = namedImportMatch[1].split(',').map(n => n.trim());
          const importPath = namedImportMatch[2];
          
          // Only check local imports
          if (importPath.startsWith('.')) {
            // Resolve the imported file path
            const importedFile = resolveImportPath(filePath, importPath);
            
            // Check if the imported file has these named exports
            if (importedFile && exportMap[importedFile]) {
              for (const name of importNames) {
                // Skip imports with 'as' renaming
                const actualName = name.split(' as ')[0].trim();
                
                if (!exportMap[importedFile].namedExports.includes(actualName) && 
                    exportMap[importedFile].defaultExport !== actualName) {
                  mismatches.push({
                    file: filePath,
                    line: index + 1,
                    import: line.trim(),
                    importedFile,
                    issue: `Named import '${actualName}' not found in ${importedFile}`,
                    suggestion: exportMap[importedFile].defaultExport ? 
                      `Use default import: import ${actualName} from '${importPath}'` :
                      `Check for typos or missing exports in ${importedFile}`
                  });
                }
              }
            }
          }
        }
      }
    });
  });
  
  if (mismatches.length > 0) {
    console.log(`\nFound ${mismatches.length} import/export mismatches:`);
    mismatches.forEach(({file, line, import: importStmt, issue, suggestion}) => {
      console.log(`${file}:${line} - ${importStmt}`);
      console.log(`  Issue: ${issue}`);
      console.log(`  Suggestion: ${suggestion}`);
      console.log();
    });
  } else {
    console.log('No import/export mismatches found!');
  }
}

mapImportsToExports();