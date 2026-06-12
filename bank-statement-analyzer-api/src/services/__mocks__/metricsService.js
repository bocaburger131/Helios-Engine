import { vi } from 'vitest';

export const promClient = {
  register: {
    contentType: 'text/plain; version=0.0.4; charset=utf-8',
    metrics: vi.fn().mockResolvedValue('# HELP test_metric A test metric\n# TYPE test_metric counter\ntest_metric 1\n')
  }
};

export const metrics = {
  httpRequestDuration: { observe: vi.fn() },
  httpRequestsTotal: { inc: vi.fn() },
  statementUploads: { inc: vi.fn() },
  statementProcessingTime: { observe: vi.fn() },
  statementErrors: { inc: vi.fn() },
  databaseQueries: { observe: vi.fn() },
  cacheHits: { inc: vi.fn() },
  cacheMisses: { inc: vi.fn() }
};

export const metricsService = {
  recordHttpRequest: vi.fn(),
  recordStatementUpload: vi.fn(),
  recordStatementProcessing: vi.fn(),
  recordStatementError: vi.fn(),
  getMetrics: vi.fn().mockResolvedValue(''),
  recordDatabaseQuery: vi.fn(),
  recordCacheHit: vi.fn(),
  recordCacheMiss: vi.fn()
};

export default metricsService;