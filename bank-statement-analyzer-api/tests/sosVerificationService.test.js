import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mockRedisClient } from './mocks/redisClient.mock.js';
import { mockPlaywright } from './mocks/playwright.mock.js';

vi.mock('../src/config/logger.js', () => ({
  default: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn()
  }
}));

let sosService;

describe('SosVerificationService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  it('should be importable and instantiable', async () => {
    // Test that we can import the service
    const { default: SosVerificationService } = await import('../src/services/sosVerificationService.js');
    
    expect(SosVerificationService).toBeDefined();
    expect(typeof SosVerificationService).toBe('function');
    
    // Test that we can create an instance
    const service = new SosVerificationService({
      queueName: 'test-queue',
      redisConfig: { host: 'localhost', port: 6379 }
    });
    
    expect(service).toBeDefined();
    expect(service.queueName).toBe('test-queue');
  });
});
