import express from 'express';

// Create a minimal Express app
const app = express();

// Add a health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Add a root endpoint
app.get('/', (req, res) => {
  res.json({ message: 'Bank Statement Analyzer API - Minimal Test' });
});

// Start the server
const port = process.env.PORT || 3000;
const server = app.listen(port, () => {
  console.log(`✅ Minimal test server is running on port ${port}`);
  console.log(`Try accessing: http://localhost:${port}/health`);
  
  // Automatically shut down after 10 seconds
  console.log('Server will automatically shut down in 10 seconds...');
  setTimeout(() => {
    server.close(() => {
      console.log('✅ Test server has been shut down');
    });
  }, 10000);
});

// Handle server errors
server.on('error', (error) => {
  console.error('❌ Server error:', error);
});