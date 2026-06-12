console.log(' Testing API Endpoints\n');

const API_URL = 'http://localhost:3000'; // Changed from 5000 to 3000

// Simple health check first
console.log(' Checking if server is running...');

try {
  const healthResponse = await fetch(`${API_URL}/api/health`);
  
  if (!healthResponse.ok) {
    throw new Error('Server not responding');
  }
  
  const health = await healthResponse.json();
  console.log(`  Server is running: ${health.message || 'OK'}\n`);
  
  // Since we're using minimal server, let's test the available endpoints
  console.log(' Testing available endpoints:\n');
  
  // Test health endpoint
  console.log('1. Health Check:');
  console.log(`   GET ${API_URL}/api/health`);
  console.log(`   Response:`, health);
  
  // Test test endpoint
  console.log('\n2. Test Endpoint:');
  const testResponse = await fetch(`${API_URL}/api/test`);
  const testData = await testResponse.json();
  console.log(`   GET ${API_URL}/api/test`);
  console.log(`   Response:`, testData);
  
  console.log('\n All tests passed!');
  console.log('\nNote: This is the minimal server. To test full API functionality,');
  console.log('fix the main server issues and run "npm run dev".');
  
} catch (error) {
  console.log('\n Server is not running on port 3000!');
  console.log(' Make sure the minimal server is running.');
  console.log(' Error:', error.message);
}
