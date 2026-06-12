const fs = require('fs');
const path = require('path');

// Check the specific route test files
const routeFiles = [
  'tests/routes/docs.test.js',
  'tests/routes/analysisRoutes.test.js'
];

routeFiles.forEach(filePath => {
  console.log(`\nExamining: ${filePath}`);
  
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    
    // Look for imports
    console.log('Imports:');
    const importRegex = /import\s+.*?from\s+['"]([^'"]+)['"]/g;
    let match;
    const imports = [];
    
    while ((match = importRegex.exec(content))) {
      imports.push(match[0]);
    }
    
    imports.forEach(imp => console.log(`- ${imp}`));
    
    // Look for potential issues
    if (content.includes('@/errors')) {
      console.log('\nIssue: Imports from @/errors');
    }
    
    if (content.includes('require(')) {
      console.log('\nIssue: Uses require() statements');
    }
    
    // Check for missing .js extensions
    const missingExtensions = imports.filter(imp => {
      const match = imp.match(/from\s+['"]([^'"]+)['"]/);
      if (!match) return false;
      const path = match[1];
      return (path.startsWith('./') || path.startsWith('../') || path.startsWith('@/')) && 
             !path.endsWith('.js') && !path.includes('node_modules');
    });
    
    if (missingExtensions.length > 0) {
      console.log('\nIssue: Missing .js extensions:');
      missingExtensions.forEach(imp => console.log(`- ${imp}`));
    }
    
  } catch (error) {
    console.error(`Error examining file: ${error.message}`);
  }
});