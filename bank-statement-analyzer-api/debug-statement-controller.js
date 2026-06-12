import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import app from './src/app.js';

describe('Debug Statement Controller', () => {
  const validToken = jwt.sign({ id: '123', email: 'test@example.com' }, process.env.JWT_SECRET || 'test-secret');

  it('should debug the GET /api/statements route', async () => {
    try {
      const response = await request(app)
        .get('/api/statements')
        .set('Authorization', `Bearer ${validToken}`)
        .timeout(5000);

      console.log('Response status:', response.status);
      console.log('Response headers:', response.headers);
      console.log('Response body:', response.body);
      console.log('Response text:', response.text);
      
      // Let's check what we actually get
      expect(response.status).toBe(200);
    } catch (error) {
      console.error('Test error:', error);
      console.error('Error stack:', error.stack);
      throw error;
    }
  });
});
