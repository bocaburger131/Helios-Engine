import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import app from '../../src/app.js';

describe('Statement Routes', () => {
  let server;
  const validToken = jwt.sign({ 
    id: '507f1f77bcf86cd799439011', 
    email: 'test@example.com' 
  }, process.env.JWT_SECRET || 'test-secret');

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    if (server) {
      server.close();
    }
  });

  it('GET /api/statements should return 401 without authentication', async () => {
    const response = await request(app)
      .get('/api/statements')
      .timeout(5000); // Add explicit timeout

    expect(response.status).toBe(401);
    expect(response.body).toHaveProperty('success', false);
  }, 10000); // Shorter timeout

  it('GET /api/statements should return 200 with authentication', async () => {
    const response = await request(app)
      .get('/api/statements')
      .set('Authorization', `Bearer ${validToken}`)
      .timeout(5000);

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('success', true);
  }, 10000);

  it('GET /api/health should work without authentication', async () => {
    const response = await request(app)
      .get('/health')
      .timeout(5000);

    expect(response.status).toBe(200);
  });

  it('POST /api/statements should create a new statement', async () => {
    const response = await request(app)
      .post('/api/statements')
      .set('Authorization', `Bearer ${validToken}`)
      .attach('statement', Buffer.from('%PDF-1.4 test content'), 'test.pdf')
      .field('uploadId', 'test-upload-123')
      .field('statementDate', '2024-01-01')
      .field('bankName', 'Test Bank')
      .field('accountNumber', '123456789')
      .timeout(5000);

    expect(response.status).toBe(201);
    expect(response.body).toHaveProperty('success', true);
  });

  it('GET /api/statements/:id should return statement details', async () => {
    const response = await request(app)
      .get('/api/statements/507f1f77bcf86cd799439011')  // Valid ObjectId format
      .set('Authorization', `Bearer ${validToken}`)
      .timeout(5000);

    expect([200, 404]).toContain(response.status);
  });

  it('DELETE /api/statements/:id should delete a statement', async () => {
    const response = await request(app)
      .delete('/api/statements/507f1f77bcf86cd799439011')  // Valid ObjectId format
      .set('Authorization', `Bearer ${validToken}`)
      .timeout(5000);

    expect([200, 404]).toContain(response.status);
  });
});
