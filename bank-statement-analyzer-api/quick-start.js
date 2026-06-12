import dotenv from 'dotenv';
dotenv.config();

// Override any cloud configurations
process.env.NODE_ENV = process.env.NODE_ENV || 'development';
process.env.PORT = process.env.PORT || '3001';
process.env.USE_REDIS = 'false';
process.env.REDIS_ENABLED = 'false';

console.log('Starting server with configuration:');
console.log('- Port:', process.env.PORT);
console.log('- MongoDB:', process.env.MONGODB_URI?.replace(/\/\/[^:]+:[^@]+@/, '//***:***@') || 'local');
console.log('- Environment:', process.env.NODE_ENV);
console.log('- Redis:', 'DISABLED');
console.log('- Cloud Services:', 'DISABLED');

// Start the server
import('./src/server.js').catch(err => {
  console.error('Failed to start server:', err);
  process.exit(1);
});