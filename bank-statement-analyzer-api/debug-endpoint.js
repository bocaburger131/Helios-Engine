import request from 'supertest';
import app from './src/app.js';

console.log('Testing statements endpoint to debug 500 error...');

const testEndpoint = async () => {
  try {
    const response = await request(app)
      .get('/api/statements')
      .timeout(3000);
    
    console.log('✅ Response received:');
    console.log('Status:', response.status);
    console.log('Body:', JSON.stringify(response.body, null, 2));
    
  } catch (error) {
    console.log('❌ Error occurred:');
    console.log('Message:', error.message);
    console.log('Stack:', error.stack);
    
    if (error.response) {
      console.log('Response Status:', error.response.status);
      console.log('Response Body:', error.response.body);
    }
  }
};

testEndpoint();
