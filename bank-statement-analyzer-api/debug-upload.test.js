import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import app from './src/app.js';

describe('File Upload Debug', () => {
  it('should debug what multer receives', async () => {
    // Create a simple PDF buffer
    const pdfBuffer = Buffer.from('%PDF-1.4\n%test content\n%%EOF');
    
    // Generate test token
    const testUser = {
      id: 'test-user-123',
      email: 'test@example.com',
      name: 'Test User',
      role: 'user',
      isActive: true
    };

    const jwt = await import('jsonwebtoken');
    const authToken = jwt.default.sign(testUser, process.env.JWT_SECRET || 'test-secret');

    console.log('Making request with token:', authToken.substring(0, 20) + '...');
    
    const response = await request(app)
      .post('/api/statements')
      .set('Authorization', `Bearer ${authToken}`)
      .attach('file', pdfBuffer, 'test.pdf')
      .field('uploadId', 'debug-test')
      .field('openingBalance', '1000');

    console.log('Response status:', response.status);
    console.log('Response body:', JSON.stringify(response.body, null, 2));
    console.log('Response headers:', response.headers);

    // Don't assert, just log for debugging
  }, 10000);
});
