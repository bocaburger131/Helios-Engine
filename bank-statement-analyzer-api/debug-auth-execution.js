// Test file to check if auth middleware has runtime errors
console.log('Testing auth middleware execution...');

// Add debugging to check if there are runtime errors
process.on('uncaughtException', (error) => {
  console.error('UNCAUGHT EXCEPTION:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('UNHANDLED REJECTION at:', promise, 'reason:', reason);
  process.exit(1);
});

(async () => {
  try {
    console.log('About to import auth middleware...');
    
    // Try to import each dependency first
    console.log('Testing jsonwebtoken...');
    const jwt = await import('jsonwebtoken');
    console.log('JWT import successful');
    
    console.log('Testing User model...');
    const User = await import('./src/models/User.js');
    console.log('User model import successful');
    
    console.log('Testing logger...');
    const logger = await import('./src/utils/logger.js');
    console.log('Logger import successful');
    
    console.log('Testing config...');
    const config = await import('./src/config/env.js');
    console.log('Config import successful');
    
    console.log('Now importing auth middleware...');
    const authModule = await import('./src/middleware/auth.middleware.js');
    console.log('Auth middleware import completed');
    console.log('Exports available:', Object.keys(authModule));
    
  } catch (error) {
    console.error('Import error:', error);
    console.error('Stack trace:', error.stack);
  }
})();
