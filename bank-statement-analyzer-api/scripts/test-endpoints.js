import fetch from 'node-fetch';

const BASE_URL = 'http://localhost:5000';

const endpoints = [
  { method: 'GET', path: '/' },
  { method: 'GET', path: '/health' },
  { method: 'POST', path: '/api/auth/login' },
  { method: 'GET', path: '/api/merchants' },
  { method: 'GET', path: '/api/transactions' },
  { method: 'GET', path: '/api/settings' },
  { method: 'GET', path: '/api/analysis' },
  { method: 'GET', path: '/api/statements' }
];

async function testEndpoints() {
  console.log('🧪 Testing API endpoints...\n');
  
  for (const endpoint of endpoints) {
    try {
      const response = await fetch(`${BASE_URL}${endpoint.path}`, {
        method: endpoint.method,
        headers: {
          'Content-Type': 'application/json'
        }
      });
      
      console.log(`${endpoint.method} ${endpoint.path}: ${response.status} ${response.statusText}`);
    } catch (error) {
      console.error(`${endpoint.method} ${endpoint.path}: ❌ ${error.message}`);
    }
  }
}

// Run the tests
testEndpoints().catch(console.error);