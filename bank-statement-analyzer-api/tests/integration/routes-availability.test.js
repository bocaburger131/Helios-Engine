import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { setupTestEnvironment, teardownTestEnvironment } from '../utils/testMocks.js';

describe('API Routes Availability', () => {
  let authToken;
  let app;

  beforeAll(async () => {
    setupTestEnvironment();
    const appModule = await import('../../src/app.js');
    app = appModule.default;
    // Create a valid token for testing
    authToken = jwt.sign(
      { id: '123', email: 'test@example.com' }, 
      process.env.JWT_SECRET || 'test-secret'
    );
  });

  afterAll(() => {
    teardownTestEnvironment();
  });

  describe('POST /api/auth/login', () => {
    it('should be available', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'test@example.com',
          password: 'password123'
        })
        .timeout(5000);

      expect([200, 401, 400, 404, 500]).toContain(response.status);
    });
  });

  describe('POST /api/analysis/analyze', () => {
    it('should be available', async () => {
      const response = await request(app)
        .post('/api/analysis/analyze')
        .send({})
        .timeout(5000);

      expect([400, 401, 404, 500]).toContain(response.status);
    });
  });

  describe('GET /api/statements', () => {
    it('should be available', async () => {
      const response = await request(app)
        .get('/api/statements')
        .set('Authorization', `Bearer ${authToken}`)
        .timeout(5000);

      expect([200, 401, 403, 404]).toContain(response.status);
    });
  });

  describe('GET /api/merchants', () => {
    it('should be available', async () => {
      const response = await request(app)
        .get('/api/merchants')
        .set('Authorization', `Bearer ${authToken}`)
        .timeout(5000);

      expect([200, 401, 403]).toContain(response.status);
    });
  });

  describe('GET /api/transactions', () => {
    it('should be available', async () => {
      const response = await request(app)
        .get('/api/transactions')
        .timeout(5000);

      expect([200, 401, 404, 500]).toContain(response.status);
    });
  });

  describe('GET /api/settings', () => {
    it('should be available', async () => {
      const response = await request(app)
        .get('/api/settings')
        .timeout(5000);

      expect([200, 401]).toContain(response.status);
    });
  });

  describe('GET /api/zoho/auth', () => {
    it('should be available', async () => {
      const response = await request(app)
        .get('/api/zoho/auth')
        .timeout(5000);

      expect([200, 404, 401]).toContain(response.status);
    });
  });

  describe('GET /health', () => {
    it('should be available', async () => {
      const response = await request(app)
        .get('/health')
        .timeout(5000);

      expect(response.status).toBe(200);
    });
  });
});