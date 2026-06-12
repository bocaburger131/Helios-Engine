const fs = require('fs');
const path = require('path');

// Get the file path from command line arguments
const filePath = process.argv[2];

if (!filePath) {
  console.error('Please provide a test file path to fix.');
  console.error('Usage: node fix-specific-test.cjs tests/path/to/file.test.js');
  process.exit(1);
}

console.log(`Fixing test file: ${filePath}`);

try {
  let content = fs.readFileSync(filePath, 'utf8');
  let modified = false;
  
  // 1. Fix Jest imports
  if (content.includes('@jest/globals')) {
    const jestImportMatch = content.match(/import\s+{([^}]+)}\s+from\s+['"]@jest\/globals['"]/);
    
    if (jestImportMatch) {
      const importedItems = jestImportMatch[1].split(',').map(item => item.trim());
      
      // Replace with vitest imports
      content = content.replace(
        /import\s+{[^}]+}\s+from\s+['"]@jest\/globals['"]/,
        `import { ${importedItems.join(', ')} } from 'vitest'`
      );
      
      modified = true;
      console.log('✅ Fixed Jest imports');
    }
  }
  
  // 2. Replace jest with vi
  if (content.includes('jest.')) {
    content = content.replace(/jest\./g, 'vi.');
    modified = true;
    console.log('✅ Replaced jest with vi');
  }
  
  // 3. Fix require statements
  if (content.includes('require(') && content.includes('import ')) {
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
      modified = true;
      console.log('✅ Fixed require statements');
    }
  }
  
  // 4. Add .js extension to local imports
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
    modified = true;
    console.log(`✅ Added .js extension to ${fixedImports} imports`);
  }
  
  // 5. Fix done callbacks
  if (content.includes('done(') || content.match(/\(\s*done\s*\)\s*=>/)) {
    // Convert (done) => { ... done() } to async () => { ... }
    content = content.replace(/\(\s*done\s*\)\s*=>/g, 'async () =>');
    content = content.replace(/done\(\);/g, '// done() removed');
    content = content.replace(/done\(null\);/g, '// done(null) removed');
    content = content.replace(/done\(error\);/g, 'throw error;');
    
    modified = true;
    console.log('✅ Fixed done callbacks');
  }
  
  // 6. Fix module.exports
  if (content.includes('module.exports')) {
    // Replace module.exports = function with export default function
    content = content.replace(/module\.exports\s*=\s*function/g, 'export default function');
    
    // Replace module.exports = { ... }
    content = content.replace(/module\.exports\s*=\s*{([^}]+)}/g, (match, exportContent) => {
      const exports = exportContent.split(',').map(e => e.trim());
      return exports.map(e => {
        const parts = e.split(':').map(p => p.trim());
        if (parts.length === 2) {
          return `export const ${parts[0]} = ${parts[1]};`;
        }
        return `export const ${e} = ${e};`;
      }).join('\n');
    });
    
    modified = true;
    console.log('✅ Fixed module.exports');
  }
  
  // Save changes if modified
  if (modified) {
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`\n✅ Successfully fixed issues in: ${filePath}`);
  } else {
    console.log(`\nℹ️ No issues found to fix in: ${filePath}`);
  }
  
} catch (error) {
  console.error(`Error processing file: ${error.message}`);
}