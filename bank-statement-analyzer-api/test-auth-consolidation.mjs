// Simple test for consolidated auth middleware
import { authenticateToken, authenticateUser, optionalAuth, generateToken } from './src/middleware/auth.middleware.js';

console.log('✅ Auth middleware imported successfully!');
console.log('Functions available:');
console.log('- authenticateToken:', typeof authenticateToken);
console.log('- authenticateUser:', typeof authenticateUser);
console.log('- optionalAuth:', typeof optionalAuth);
console.log('- generateToken:', typeof generateToken);

console.log('\n✅ Consolidation successful - all middleware functions imported correctly!');
