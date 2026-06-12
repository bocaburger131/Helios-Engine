import fetch from 'node-fetch';

const API_URL = 'http://localhost:5000/api';

async function checkServerHealth() {
  try {
    console.log(' Checking if server is running...');
    const response = await fetch(`${API_URL}/health`);
    if (response.ok) {
      console.log('✅ Server is running!\n');
      return true;
    } else {
      throw new Error(`Server returned status ${response.status}`);
    }
  } catch (error) {
    console.log('\n Server is not running!');
    console.log(' Please run "npm run dev" in another terminal first.');
    console.log(' Steps:');
    console.log('   1. Open a new terminal');
    console.log('   2. Navigate to this directory');
    console.log('   3. Run: npm run dev');
    console.log('   4. Wait for "Server running on port 5000"');
    console.log('   5. Run this test again\n');
    process.exit(1);
  }
}

async function testAPI() {
  console.log(' Testing API Endpoints\n');
  
  // Check server health first
  await checkServerHealth();
  
  try {
    // Test 1: Auth endpoints
    console.log('1 Testing authentication...');
    const testUser = {
      email: `test${Date.now()}@example.com`,
      password: 'TestPassword123!',
      name: 'Test User'
    };
    
    // Register
    const registerResponse = await fetch(`${API_URL}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(testUser)
    });
    
    if (registerResponse.ok) {
      const data = await registerResponse.json();
      console.log('    Registration successful');
      console.log(`   Token: ${data.token.substring(0, 20)}...`);
      
      // Test login with same credentials
      console.log('\n2 Testing login...');
      const loginResponse = await fetch(`${API_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: testUser.email,
          password: testUser.password
        })
      });
      
      if (loginResponse.ok) {
        const loginData = await loginResponse.json();
        console.log('    Login successful');
        console.log(`   Token: ${loginData.token.substring(0, 20)}...`);
      } else {
        console.log('    Login failed');
      }
      
    } else {
      const error = await registerResponse.text();
      console.log(`    Registration failed: ${error}`);
    }
    
    console.log('\n API tests completed!');
    
  } catch (error) {
    console.error(' API test failed:', error.message);
  }
}

// Run the test
testAPI();
