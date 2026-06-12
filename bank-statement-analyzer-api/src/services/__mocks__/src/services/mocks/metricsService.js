import { vi } from 'vitest';

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