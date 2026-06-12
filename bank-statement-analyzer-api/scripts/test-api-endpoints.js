import http from 'http';
import express from 'express';
import cors from 'cors';
import compression from 'compression';
import helmet from 'helmet';

// Create a minimal version of your app
const app = express();

// Add essential middleware
app.use(cors());
app.use(helmet({
  contentSecurityPolicy: false // Disable for testing
}));
app.use(compression());
app.use(express.json());

// Add health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok',
    time: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development'
  });
});

// Add API info endpoint
app.get('/', (req, res) => {
  res.json({
    message: 'Bank Statement Analyzer API',
    version: '1.0.0',
    endpoints: [
      { path: '/health', method: 'GET', description: 'Health check endpoint' },
      { path: '/', method: 'GET', description: 'API info' }
    ]
  });
});

// Add a mock authentication endpoint
app.post('/auth/login', (req, res) => {
  const { username, password } = req.body;
  
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required' });
  }
  
  // For testing purposes only - always succeed with test credentials
  if (username === 'test@example.com' && password === 'password') {
    return res.json({
      token: 'test-jwt-token',
      user: {
        id: '123456',
        email: username,
        name: 'Test User'
      }
    });
  }
  
  res.status(401).json({ error: 'Invalid credentials' });
});

// Add error handling
app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

app.use((err, req, res, next) => {
  console.error('API Error:', err);
  res.status(err.status || 500).json({
    error: err.message || 'Internal Server Error'
  });
});

// Start server
const port = process.env.PORT || 3000;
const server = http.createServer(app);

server.listen(port, () => {
  console.log(`🚀 Test API Server running at http://localhost:${port}`);
  console.log('\n📝 Available endpoints:');
  console.log('  - GET  /health         - Health check');
  console.log('  - GET  /               - API info');
  console.log('  - POST /auth/login     - Mock authentication');
  
  // Run some tests automatically
  runTests().catch(console.error);
});

// Auto-run some basic tests
async function runTests() {
  console.log('\n🧪 Running automated tests...');
  await new Promise(resolve => setTimeout(resolve, 500)); // Small delay
  
  try {
    // Test health endpoint
    console.log('\n✅ Testing GET /health');
    const healthResponse = await fetch(`http://localhost:${port}/health`);
    const healthData = await healthResponse.json();
    console.log(`   Status: ${healthResponse.status}`);
    console.log(`   Body: ${JSON.stringify(healthData)}`);
    
    // Test root endpoint
    console.log('\n✅ Testing GET /');
    const rootResponse = await fetch(`http://localhost:${port}/`);
    const rootData = await rootResponse.json();
    console.log(`   Status: ${rootResponse.status}`);
    console.log(`   Message: ${rootData.message}`);
    
    // Test login endpoint with valid credentials
    console.log('\n✅ Testing POST /auth/login (valid credentials)');
    const loginResponse = await fetch(`http://localhost:${port}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'test@example.com', password: 'password' })
    });
    const loginData = await loginResponse.json();
    console.log(`   Status: ${loginResponse.status}`);
    console.log(`   Has token: ${!!loginData.token}`);
    
    // Test login endpoint with invalid credentials
    console.log('\n✅ Testing POST /auth/login (invalid credentials)');
    const invalidLoginResponse = await fetch(`http://localhost:${port}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'wrong@example.com', password: 'wrongpass' })
    });
    console.log(`   Status: ${invalidLoginResponse.status} (expected 401)`);
    
    // Test non-existent endpoint
    console.log('\n✅ Testing GET /non-existent');
    const notFoundResponse = await fetch(`http://localhost:${port}/non-existent`);
    console.log(`   Status: ${notFoundResponse.status} (expected 404)`);
    
    console.log('\n🎉 All tests completed!');
    console.log('\nPress Ctrl+C to stop the server...');
  } catch (error) {
    console.error('\n❌ Test error:', error);
  }
}

// Handle server shutdown
process.on('SIGINT', () => {
  console.log('\n👋 Shutting down server...');
  server.close(() => {
    console.log('✅ Server stopped');
    process.exit(0);
  });
});