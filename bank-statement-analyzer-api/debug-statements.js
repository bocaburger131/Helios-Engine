import request from 'supertest';
import app from '../src/app.js';

const testStatementsEndpoint = async () => {
  try {
    console.log('Testing /api/statements endpoint...');
    
    const response = await request(app)
      .get('/api/statements')
      .timeout(5000);
    
    console.log('Response status:', response.status);
    console.log('Response body:', response.body);
    console.log('Response headers:', response.headers);
    
  } catch (error) {
    console.error('Error:', error.message);
    console.error('Stack:', error.stack);
  }
};

testStatementsEndpoint();
