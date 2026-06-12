/**
 * Security Test Script
 * 
 * This script tests the security implementation including:
 * - API key validation
 * - JWT token validation
 * - Proper error responses
 * - Security headers
 */

import axios from 'axios';

const BASE_URL = 'http://localhost:3001/api';

// Test cases for security validation
const testSecurityImplementation = async () => {
  console.log('🔒 Testing Security Implementation...\n');

  try {
    // Test 1: Missing API key for public endpoint
    console.log('Test 1: Missing API key for public endpoint');
    try {
      await axios.post(`${BASE_URL}/statements/veritas-public`, {
        transactions: [],
        openingBalance: 1000
      });
    } catch (error) {
      if (error.response?.status === 401) {
        console.log('✅ Correctly returned 401 for missing API key');
        console.log('   Response:', error.response.data);
      } else {
        console.log('❌ Expected 401 but got:', error.response?.status);
      }
    }

    console.log('\n---\n');

    // Test 2: Invalid API key
    console.log('Test 2: Invalid API key');
    try {
      await axios.post(`${BASE_URL}/statements/veritas-public`, {
        transactions: [],
        openingBalance: 1000
      }, {
        headers: {
          'X-API-Key': 'invalid-key-123'
        }
      });
    } catch (error) {
      if (error.response?.status === 401) {
        console.log('✅ Correctly returned 401 for invalid API key');
        console.log('   Response:', error.response.data);
      } else {
        console.log('❌ Expected 401 but got:', error.response?.status);
      }
    }

    console.log('\n---\n');

    // Test 3: Valid API key
    console.log('Test 3: Valid API key');
    try {
      const response = await axios.post(`${BASE_URL}/statements/veritas-public`, {
        transactions: [],
        openingBalance: 1000
      }, {
        headers: {
          'X-API-Key': 'demo-api-key-1'
        }
      });
      console.log('✅ Valid API key accepted');
      console.log('   Status:', response.status);
    } catch (error) {
      console.log('🔍 Response with valid API key:', error.response?.status, error.response?.data);
    }

    console.log('\n---\n');

    // Test 4: Missing JWT token for protected endpoint
    console.log('Test 4: Missing JWT token for protected endpoint');
    try {
      await axios.get(`${BASE_URL}/statements/list`);
    } catch (error) {
      if (error.response?.status === 401) {
        console.log('✅ Correctly returned 401 for missing JWT token');
        console.log('   Response:', error.response.data);
      } else {
        console.log('❌ Expected 401 but got:', error.response?.status);
      }
    }

    console.log('\n---\n');

    // Test 5: Invalid JWT token
    console.log('Test 5: Invalid JWT token');
    try {
      await axios.get(`${BASE_URL}/statements/list`, {
        headers: {
          'Authorization': 'Bearer invalid-token-123'
        }
      });
    } catch (error) {
      if (error.response?.status === 401) {
        console.log('✅ Correctly returned 401 for invalid JWT token');
        console.log('   Response:', error.response.data);
      } else {
        console.log('❌ Expected 401 but got:', error.response?.status);
      }
    }

    console.log('\n---\n');

    // Test 6: Check security headers
    console.log('Test 6: Security headers validation');
    try {
      const response = await axios.get(`${BASE_URL}/health`);
      const headers = response.headers;
      
      console.log('Security Headers Present:');
      console.log('  X-Content-Type-Options:', headers['x-content-type-options'] ? '✅' : '❌');
      console.log('  X-Frame-Options:', headers['x-frame-options'] ? '✅' : '❌');
      console.log('  X-XSS-Protection:', headers['x-xss-protection'] ? '✅' : '❌');
      console.log('  X-Request-ID:', headers['x-request-id'] ? '✅' : '❌');
      console.log('  X-Response-Time:', headers['x-response-time'] ? '✅' : '❌');
      console.log('  X-API-Version:', headers['x-api-version'] ? '✅' : '❌');
      
    } catch (error) {
      console.log('❌ Error checking security headers:', error.message);
    }

  } catch (error) {
    console.error('❌ Test script error:', error.message);
  }
};

// Check if server is running
const checkServerHealth = async () => {
  try {
    const response = await axios.get(`${BASE_URL}/health`);
    console.log('🟢 Server is healthy, starting security tests...\n');
    return true;
  } catch (error) {
    console.log('🔴 Server not available:', error.message);
    console.log('🔴 Error details:', error.code, error.response?.status);
    console.log('   Run: npm start or npm run dev\n');
    return false;
  }
};

// Main execution
const main = async () => {
  console.log('🔒 Bank Statement Analyzer - Security Test Suite');
  console.log('================================================\n');
  
  const serverHealthy = await checkServerHealth();
  if (serverHealthy) {
    await testSecurityImplementation();
  }
  
  console.log('\n🏁 Security tests completed!');
};

// Handle uncaught errors
process.on('unhandledRejection', (error) => {
  console.error('❌ Unhandled error:', error.message);
  process.exit(1);
});

// Run the tests
main();
