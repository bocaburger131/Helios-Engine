import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../../src/app.js';

describe('Metrics Integration Tests', () => {
  it('should return metrics in Prometheus format', async () => {
    const response = await request(app)
      .get('/api/metrics')
      .set('Accept', 'text/plain');

    expect(response.status).toBe(200);
    expect(response.type).toBe('text/plain');
  expect(response.text).toContain('# HELP http_request_duration_seconds');
  expect(response.text).toContain('# TYPE http_request_duration_seconds histogram');
  expect(response.text).toContain('# HELP http_requests_total');
  });

  it('should return metrics in JSON format when requested', async () => {
    const response = await request(app)
      .get('/api/metrics')
      .set('Accept', 'application/json');

    expect(response.status).toBe(200);
    expect(response.type).toBe('application/json');
    expect(response.body).toHaveProperty('uptime');
    expect(response.body).toHaveProperty('totalRequests');
    expect(response.body).toHaveProperty('totalErrors');
    expect(response.body).toHaveProperty('timestamp');
  });
});
