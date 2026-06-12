import dotenv from 'dotenv';
dotenv.config();

console.log(' Starting server with enhanced error handling...\n');

// Set up uncaught exception handler
process.on('uncaughtException', (error) => {
  console.error(' Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (error) => {
  console.error(' Unhandled Rejection:', error);
  process.exit(1);
});

// Check critical environment variables
const requiredEnvVars = ['MONGODB_URI', 'JWT_SECRET', 'PORT'];
const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);

if (missingVars.length > 0) {
  console.error(' Missing required environment variables:', missingVars.join(', '));
  console.log(' Please check your .env file');
  process.exit(1);
}

// Start the server
try {
  await import('./src/server.js');
} catch (error) {
  console.error(' Failed to start server:', error);
  process.exit(1);
}
