import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import request from 'supertest';
import app from '../../src/app.js';
import { setupTestEnvironment, teardownTestEnvironment } from '../utils/testMocks.js';

// Mock metricsService
vi.mock('../../src/services/metricsService.js', () => ({
  promClientExport: {
    register: {
      metrics: vi.fn().mockResolvedValue('# HELP test_metric\ntest_metric 1')
    }
  },
  metrics: {
    httpRequestsTotal: { inc: vi.fn() },
    httpRequestDuration: { observe: vi.fn() }
  }
}));

describe('Metrics Integration Tests', () => {
  let server;

  beforeAll(() => {
    setupTestEnvironment();
    server = app.listen(0); // Random port
  });

  afterAll((done) => {
    teardownTestEnvironment();
    server.close(done);
  });

  describe('GET /api/metrics', () => {
    it('should return Prometheus metrics format', async () => {
      const response = await request(app)
        .get('/api/metrics');

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toContain('text/plain');
      expect(response.text).toContain('# HELP');
      expect(response.text).toContain('http_requests_total');
    });

    it('should return metrics with proper format', async () => {
      const response = await request(app)
        .get('/api/metrics')
        .expect(200);

      expect(response.text).toContain('# TYPE');
      expect(response.text).toContain('http_request_duration_seconds');
    });
  });

  describe('Health Check', () => {
    it('should return health status', async () => {
      const response = await request(app)
        .get('/api/health')
        .expect(200);

      expect(response.body).toHaveProperty('status');
      expect(response.body).toHaveProperty('timestamp');
    });
  });

  it('should return metrics', async () => {
    const response = await request(app)
      .get('/api/monitoring/metrics');

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toContain('text/plain');
  });
});