const fs = require('fs');
const path = require('path');
const glob = require('glob');

// Find all test files
const testFiles = glob.sync('tests/**/*.test.js');
console.log(`Found ${testFiles.length} test files to process`);

let modifiedCount = 0;

// Process each test file
testFiles.forEach(filePath => {
  let content = fs.readFileSync(filePath, 'utf8');
  let modified = false;
  
  // Fix relative paths to use @ alias
  const relativeImportRegex = /from\s+['"]\.\.\/\.\.\/src\/([^'"]+)['"]/g;
  if (content.match(relativeImportRegex)) {
    content = content.replace(relativeImportRegex, "from '@/$1'");
    modified = true;
  }
  
  // Add .js extension to local imports if missing
  const importRegex = /import\s+(?:{[^}]*}|\w+|\*\s+as\s+\w+)\s+from\s+['"]([^'"]+)['"]/g;
  let match;
  let newContent = content;
  
  while ((match = importRegex.exec(content)) !== null) {
    const importPath = match[1];
    // Only add .js to relative paths or @/ paths, not to node_modules
    if ((importPath.startsWith('./') || importPath.startsWith('../') || importPath.startsWith('@/')) 
        && !importPath.endsWith('.js') && !importPath.includes('node_modules')) {
      newContent = newContent.replace(
        new RegExp(`from\\s+['"]${importPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}['"]`, 'g'),
        `from '${importPath}.js'`
      );
      modified = true;
    }
  }
  
  content = newContent;
  
  // Save changes if modified
  if (modified) {
    fs.writeFileSync(filePath, content, 'utf8');
    modifiedCount++;
    console.log(`Fixed import paths in: ${filePath}`);
  }
});

console.log(`Successfully modified ${modifiedCount} files`);