// Minimal test to debug auth middleware exports
console.log('Starting minimal auth test...');

// Test 1: Try to load the file and see what happens
console.log('\n=== Test 1: Basic file load ===');
try {
  console.log('Attempting to load auth middleware file...');
  const fs = require('fs');
  const path = require('path');
  
  const authPath = path.join(__dirname, 'src/middleware/auth.middleware.js');
  console.log('File path:', authPath);
  console.log('File exists:', fs.existsSync(authPath));
  
  if (fs.existsSync(authPath)) {
    const fileSize = fs.statSync(authPath).size;
    console.log('File size:', fileSize, 'bytes');
  }
} catch (error) {
  console.error('File check error:', error.message);
}

// Test 2: Try dynamic import step by step
console.log('\n=== Test 2: Dynamic import ===');
(async () => {
  try {
    console.log('Attempting dynamic import...');
    const authModule = await import('./src/middleware/auth.middleware.js');
    console.log('Import successful!');
    console.log('Module type:', typeof authModule);
    console.log('Module keys:', Object.keys(authModule));
    console.log('Module prototype:', Object.getPrototypeOf(authModule));
    
    // Check specific exports
    console.log('authenticateUser:', typeof authModule.authenticateUser);
    console.log('authenticateToken:', typeof authModule.authenticateToken);
    console.log('optionalAuth:', typeof authModule.optionalAuth);
    console.log('default export:', typeof authModule.default);
    
    if (authModule.default) {
      console.log('Default export keys:', Object.keys(authModule.default));
    }
    
  } catch (error) {
    console.error('Dynamic import error:', error);
    console.error('Stack:', error.stack);
  }
})();
