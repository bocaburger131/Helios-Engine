const fs = require('fs');
const path = require('path');

// Load the failing tests from batch results
let failingTests = [];
try {
  const results = JSON.parse(fs.readFileSync('batch-test-results.json', 'utf8'));
  failingTests = results.failing.filter(item => item.includes('.test.js'));
  
  // If there are failing directories but no specific files identified, find all files in those directories
  if (failingTests.length === 0 && results.failing.length > 0) {
    const glob = require('glob');
    results.failing.forEach(dir => {
      if (!dir.includes('.test.js')) {
        const dirFiles = glob.sync(`${dir}/**/*.test.js`);
        failingTests.push(...dirFiles);
      }
    });
  }
} catch (error) {
  console.log('No batch-test-results.json found. Processing all test files.');
  const glob = require('glob');
  failingTests = glob.sync('tests/**/*.test.js');
}

console.log(`Found ${failingTests.length} tests to fix`);

let fixedCount = 0;

// Process each failing test
failingTests.forEach(filePath => {
  console.log(`\nProcessing: ${filePath}`);
  
  try {
    let content = fs.readFileSync(filePath, 'utf8');
    let modified = false;
    
    // Apply comprehensive fixes
    
    // 1. Fix imports and require statements
    if (content.includes('@jest/globals')) {
      content = content.replace(
        /import\s+{([^}]+)}\s+from\s+['"]@jest\/globals['"]/,
        'import { $1 } from "vitest"'
      );
      console.log('  - Fixed @jest/globals import');
      modified = true;
    }
    
    if (content.includes('jest.')) {
      content = content.replace(/jest\./g, 'vi.');
      console.log('  - Replaced jest with vi');
      modified = true;
    }
    
    // 2. Fix require statements
    if (content.includes('require(')) {
      const requireRegex = /(?:const|let|var)\s+([a-zA-Z0-9_]+)\s+=\s+require\(['"]([^'"]+)['"]\)/g;
      let match;
      const replacements = [];
      
      while ((match = requireRegex.exec(content)) !== null) {
        const variableName = match[1];
        const importPath = match[2];
        const fullMatch = match[0];
        
        replacements.push({
          fullMatch,
          replacement: `import ${variableName} from '${importPath}'`
        });
      }
      
      replacements.forEach(({ fullMatch, replacement }) => {
        content = content.replace(fullMatch, replacement);
      });
      
      if (replacements.length > 0) {
        console.log(`  - Converted ${replacements.length} require statements to imports`);
        modified = true;
      }
    }
    
    // 3. Fix missing .js extensions
    const importRegex = /import\s+(?:{[^}]*}|\w+|\*\s+as\s+\w+)\s+from\s+['"]([^'"]+)['"]/g;
    let match;
    let newContent = content;
    let fixedImports = 0;
    
    while ((match = importRegex.exec(content)) !== null) {
      const importPath = match[1];
      if ((importPath.startsWith('./') || importPath.startsWith('../') || importPath.startsWith('@/')) 
          && !importPath.endsWith('.js') && !importPath.includes('node_modules')) {
        newContent = newContent.replace(
          new RegExp(`from\\s+['"]${importPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}['"]`, 'g'),
          `from '${importPath}.js'`
        );
        fixedImports++;
      }
    }
    
    if (fixedImports > 0) {
      content = newContent;
      console.log(`  - Added .js extension to ${fixedImports} imports`);
      modified = true;
    }
    
    // 4. Fix done callbacks in tests
    if (content.includes('done(') || content.match(/\(\s*done\s*\)\s*=>/)) {
      let doneFixes = 0;
      
      // Replace (done) => { ... done() } with async () => { ... }
      const doneRegex = /it\(['"][^'"]+['"],\s*(?:async\s*)?\(\s*done\s*\)\s*=>/g;
      const doneMatches = content.match(doneRegex) || [];
      
      if (doneMatches.length > 0) {
        doneMatches.forEach(match => {
          if (!match.includes('async')) {
            content = content.replace(match, match.replace(/\(\s*done\s*\)/, 'async ()'));
          } else {
            content = content.replace(match, match.replace(/async\s*\(\s*done\s*\)/, 'async ()'));
          }
          doneFixes++;
        });
      }
      
      // Replace done() calls
      const doneCallRegex = /done\(\);/g;
      const doneCallMatches = content.match(doneCallRegex) || [];
      
      if (doneCallMatches.length > 0) {
        content = content.replace(/done\(\);/g, '// done() removed');
        doneFixes += doneCallMatches.length;
      }
      
      if (doneFixes > 0) {
        console.log(`  - Fixed ${doneFixes} done callbacks`);
        modified = true;
      }
    }
    
    // 5. Fix module.exports
    if (content.includes('module.exports')) {
      // Replace module.exports = function with export default function
      const moduleExportFnRegex = /module\.exports\s*=\s*function/g;
      const moduleExportFnMatches = content.match(moduleExportFnRegex) || [];
      
      if (moduleExportFnMatches.length > 0) {
        content = content.replace(moduleExportFnRegex, 'export default function');
        console.log(`  - Converted module.exports = function to export default function`);
        modified = true;
      }
      
      // Replace module.exports = { ... }
      const moduleExportObjRegex = /module\.exports\s*=\s*{([^}]+)}/g;
      const moduleExportObjMatches = content.match(moduleExportObjRegex) || [];
      
      if (moduleExportObjMatches.length > 0) {
        moduleExportObjMatches.forEach(match => {
          const exportContent = match.match(/module\.exports\s*=\s*{([^}]+)}/)[1];
          const exports = exportContent.split(',').map(e => e.trim());
          const namedExports = exports.map(e => {
            const parts = e.split(':').map(p => p.trim());
            if (parts.length === 2) {
              return `export const ${parts[0]} = ${parts[1]};`;
            }
            return `export const ${e} = ${e};`;
          }).join('\n');
          
          content = content.replace(match, namedExports);
        });
        
        console.log(`  - Converted module.exports = { ... } to named exports`);
        modified = true;
      }
    }
    
    // 6. Fix vi.mock() implementations
    if (content.includes('vi.mock(')) {
      // Simplify vi.mock({ __esModule: true, ... })
      const mockEsModuleRegex = /vi\.mock\(['"]([^'"]+)['"]\s*,\s*\(\)\s*=>\s*\(\{\s*__esModule:\s*true,\s*(.*?)\s*\}\)\)/gs;
      const mockEsModuleMatches = content.match(mockEsModuleRegex) || [];
      
      if (mockEsModuleMatches.length > 0) {
        content = content.replace(mockEsModuleRegex, 'vi.mock("$1", () => ($2))');
        console.log(`  - Simplified ${mockEsModuleMatches.length} vi.mock() calls`);
        modified = true;
      }
      
      // Ensure mock definitions are at the top
      const mockStatements = [];
      const mockRegex = /vi\.mock\(['"]([^'"]+)['"](?:,\s*(?:\(\)\s*=>\s*\{([^}]*)\}\)|\(\)\s*=>\s*\(([^)]*)\)))?/g;
      
      let mockMatch;
      while ((mockMatch = mockRegex.exec(content)) !== null) {
        mockStatements.push(mockMatch[0]);
      }
      
      if (mockStatements.length > 0) {
        // Remove all mock statements from their current position
        const contentWithoutMocks = content;
        mockStatements.forEach(stmt => {
          contentWithoutMocks = contentWithoutMocks.replace(stmt, '');
        });
        
        // Add them back at the top, after imports
        const importRegex = /import\s+.*?;/g;
        let lastImportMatch;
        let lastImportIndex = 0;
        
        while ((match = importRegex.exec(content)) !== null) {
          lastImportMatch = match;
          lastImportIndex = match.index + match[0].length;
        }
        
        const mockStatementsText = mockStatements.join(';\n') + ';\n\n';
        
        if (lastImportIndex > 0) {
          content = content.slice(0, lastImportIndex) + '\n\n' + mockStatementsText + content.slice(lastImportIndex);
          console.log(`  - Moved ${mockStatements.length} vi.mock() statements to top of file`);
          modified = true;
        }
      }
    }
    
    // Save changes if modified
    if (modified) {
      fs.writeFileSync(filePath, content, 'utf8');
      fixedCount++;
      console.log(`✅ Successfully fixed issues in: ${filePath}`);
    } else {
      console.log(`ℹ️ No issues found to fix in: ${filePath}`);
    }
    
  } catch (error) {
    console.error(`Error processing file ${filePath}: ${error.message}`);
  }
});

console.log(`\n--- SUMMARY ---`);
console.log(`Fixed ${fixedCount} of ${failingTests.length} test files`);