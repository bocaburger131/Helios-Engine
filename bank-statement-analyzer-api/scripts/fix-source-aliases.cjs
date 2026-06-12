const fs = require('fs');
const path = require('path');
const glob = require('glob');

// Find all source files
const sourceFiles = glob.sync('src/**/*.js');
console.log(`Found ${sourceFiles.length} source files to check for path aliases`);

let fixedCount = 0;

// Process each file
sourceFiles.forEach(filePath => {
  let content = fs.readFileSync(filePath, 'utf8');
  let modified = false;
  
  // Check for imports using @/errors
  if (content.includes('@/errors')) {
    // Replace with correct path (using utils/errors instead)
    content = content.replace(/['"]@\/errors['"]/g, '"@/utils/errors.js"');
    modified = true;
  }
  
  // Check for other imports without .js extension
  const importRegex = /import\s+(?:{[^}]*}|\w+|\*\s+as\s+\w+)\s+from\s+['"](@\/[^'"]+)['"]/g;
  let match;
  let newContent = content;
  
  while ((match = importRegex.exec(content)) !== null) {
    const importPath = match[1];
    if (!importPath.endsWith('.js')) {
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
    fixedCount++;
    console.log(`Fixed path aliases in: ${filePath}`);
  }
});

console.log(`\nSuccessfully fixed path aliases in ${fixedCount} source files`);