import { authenticateUser, authenticateToken, optionalAuth } from './src/middleware/auth.middleware.js';

console.log('✅ Successfully imported auth middleware functions:');
console.log('authenticateUser:', typeof authenticateUser);
console.log('authenticateToken:', typeof authenticateToken);
console.log('optionalAuth:', typeof optionalAuth);
