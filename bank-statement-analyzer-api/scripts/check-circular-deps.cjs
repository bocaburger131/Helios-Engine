const fs = require('fs');
const path = require('path');
const glob = require('glob');

// Find all source files
const sourceFiles = glob.sync('src/**/*.js');

// Map of file dependencies
const dependencies = {};
const importRegex = /import\s+(?:{[^}]*}|\w+|\*\s+as\s+\w+)\s+from\s+['"]([^'"]+)['"]/g;

// Build dependency graph
sourceFiles.forEach(filePath => {
  const content = fs.readFileSync(filePath, 'utf8');
  const imports = [];
  let match;
  
  while ((match = importRegex.exec(content))) {
    const importPath = match[1];
    if (importPath.startsWith('@/') || importPath.startsWith('./') || importPath.startsWith('../')) {
      imports.push(importPath);
    }
  }
  
  dependencies[filePath] = imports;
});

// Check for circular dependencies
function findCircularDeps(filePath, visited = new Set(), path = []) {
  if (visited.has(filePath)) {
    return path.slice(path.indexOf(filePath)).concat(filePath);
  }
  
  visited.add(filePath);
  path.push(filePath);
  
  const imports = dependencies[filePath] || [];
  for (const importPath of imports) {
    let resolvedPath;
    
    if (importPath.startsWith('@/')) {
      resolvedPath = path.resolve('src', importPath.slice(2));
    } else {
      resolvedPath = path.resolve(path.dirname(filePath), importPath);
    }
    
    // Resolve the actual file (adding .js if needed)
    if (!resolvedPath.endsWith('.js')) {
      resolvedPath += '.js';
    }
    
    if (dependencies[resolvedPath]) {
      const cycle = findCircularDeps(resolvedPath, visited, [...path]);
      if (cycle.length > 0) {
        return cycle;
      }
    }
  }
  
  return [];
}

// Check each file for circular dependencies
let foundCircular = false;
sourceFiles.forEach(filePath => {
  const cycle = findCircularDeps(filePath);
  if (cycle.length > 0) {
    console.log(`Found circular dependency starting from ${filePath}:`);
    console.log(cycle.join(' -> '));
    foundCircular = true;
  }
});

if (!foundCircular) {
  console.log('No circular dependencies found.');
}