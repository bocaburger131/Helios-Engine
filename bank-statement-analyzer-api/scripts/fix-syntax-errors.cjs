const fs = require('fs');
const path = require('path');

// Load the files with syntax errors
let filesWithSyntaxErrors = [];
try {
  filesWithSyntaxErrors = JSON.parse(fs.readFileSync('syntax-error-files.json', 'utf8'));
} catch (error) {
  console.log('No syntax-error-files.json found. Run detect-syntax-errors.cjs first.');
  process.exit(1);
}

console.log(`Found ${filesWithSyntaxErrors.length} files with syntax errors to fix`);

let fixedCount = 0;

// Process each file with syntax errors
filesWithSyntaxErrors.forEach(({ filePath }) => {
  let content = fs.readFileSync(filePath, 'utf8');
  let modified = false;
  
  // 1. Fix ES module vs CommonJS mixed syntax
  // Look for require() alongside import statements
  if (content.includes('import ') && content.includes('require(')) {
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
    }
  }
  
  // 2. Fix module.exports in ES module files
  if (content.includes('module.exports') && content.includes('import ')) {
    // Replace module.exports with export default
    content = content.replace(/module\.exports\s*=\s*/, 'export default ');
    
    // Replace module.exports = { ... } with named exports
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
  }
  
  // 3. Fix arrow function syntax
  // Look for mismatched parentheses and braces in arrow functions
  const arrowFnRegex = /\(\s*([^)]*)\s*\)\s*=>\s*(?:{[^}]*}|\([^)]*\))/g;
  let arrowMatch;
  
  while ((arrowMatch = arrowFnRegex.exec(content)) !== null) {
    const fullMatch = arrowMatch[0];
    
    // Check for unbalanced braces
    const braceCount = (fullMatch.match(/{/g) || []).length - (fullMatch.match(/}/g) || []).length;
    
    if (braceCount !== 0) {
      // There's a brace imbalance - try to fix it
      const fixedMatch = fullMatch.replace(/\)\s*=>\s*{/, ') => {\n').concat(braceCount > 0 ? '}'.repeat(braceCount) : '');
      content = content.replace(fullMatch, fixedMatch);
      modified = true;
    }
  }
  
  // 4. Fix async/await syntax
  // Make sure async is properly placed
  if (content.includes('async') && content.includes('await')) {
    // Fix missing async in function declarations
    if (content.includes('await') && !content.match(/async\s+function/)) {
      const fnWithAwaitRegex = /function\s+([a-zA-Z0-9_]+)\s*\([^)]*\)\s*{[^}]*await/g;
      content = content.replace(fnWithAwaitRegex, 'async function $1(');
      modified = true;
    }
    
    // Fix missing async in arrow functions
    if (content.includes('await') && !content.match(/async\s*\(/)) {
      const arrowWithAwaitRegex = /\(\s*([^)]*)\s*\)\s*=>\s*{[^}]*await/g;
      content = content.replace(arrowWithAwaitRegex, 'async ($1) => {');
      modified = true;
    }
  }
  
  // 5. Fix import statements with .js extension missing
  const importRegex = /import\s+(?:{[^}]*}|\w+|\*\s+as\s+\w+)\s+from\s+['"]([^'"]+)['"]/g;
  let importMatch;
  
  while ((importMatch = importRegex.exec(content)) !== null) {
    const importPath = importMatch[1];
    if ((importPath.startsWith('./') || importPath.startsWith('../') || importPath.startsWith('@/')) 
        && !importPath.endsWith('.js') && !importPath.includes('node_modules')) {
      content = content.replace(
        new RegExp(`from\\s+['"]${importPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}['"]`, 'g'),
        `from '${importPath}.js'`
      );
      modified = true;
    }
  }
  
  // 6. Fix mock implementations that use return instead of using mock methods
  if (content.includes('vi.mock(') && content.includes('return ')) {
    // Replace vi.mock() that return functions with mockImplementation
    content = content.replace(/vi\.fn\(\)\.mockImplementation\(\(\)\s*=>\s*\{\s*return\s+([^;]+);\s*\}\)/g, 'vi.fn().mockReturnValue($1)');
    
    // Replace direct return functions in mock objects
    content = content.replace(/(\w+):\s*\(\)\s*=>\s*\{\s*return\s+([^;]+);\s*\}/g, '$1: () => $2');
    
    modified = true;
  }
  
  // 7. Fix incorrect destructuring syntax
  if (content.includes('{') && content.includes('}')) {
    // Fix missing commas in object destructuring
    const badDestructuringRegex = /{([^}]+)}/g;
    let destructuringMatch;
    
    while ((destructuringMatch = badDestructuringRegex.exec(content)) !== null) {
      const inner = destructuringMatch[1];
      if (inner.includes('\n') && !inner.includes(',') && inner.match(/\w+\s+\w+/)) {
        // Likely a multiline destructuring without commas
        const fixed = inner.replace(/(\w+)\s+(\w+)/g, '$1, $2');
        content = content.replace(inner, fixed);
        modified = true;
      }
    }
  }
  
  // Save changes if modified
  if (modified) {
    fs.writeFileSync(filePath, content, 'utf8');
    fixedCount++;
    console.log(`Fixed syntax issues in: ${filePath}`);
  } else {
    console.log(`No automatic fixes available for: ${filePath}`);
  }
});

console.log(`\nSuccessfully fixed syntax issues in ${fixedCount} of ${filesWithSyntaxErrors.length} files`);