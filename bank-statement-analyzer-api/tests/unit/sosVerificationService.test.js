/**
 * SosVerificationService Unit Test
 * ================================
 * Tests the SOS (Secretary of State) verification service with mocked Redis queue
 * and Playwright browser automation.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

const { mockRedisInstance, mockChromium } = vi.hoisted(() => {
  const redis = {
    on: vi.fn(),
    lpush: vi.fn().mockResolvedValue(1),
    rpush: vi.fn().mockResolvedValue(1),
    blpop: vi.fn().mockResolvedValue(null),
    setex: vi.fn().mockResolvedValue('OK'),
    get: vi.fn().mockResolvedValue(null),
    llen: vi.fn().mockResolvedValue(0),
    keys: vi.fn().mockResolvedValue([])
  };

  const chromium = {
    use: vi.fn(),
    connectOverCDP: vi.fn().mockRejectedValue(new Error('no browser')),
    launch: vi.fn().mockResolvedValue({
      close: vi.fn(),
      newContext: vi.fn().mockResolvedValue({
        close: vi.fn(),
        newPage: vi.fn().mockResolvedValue({
          close: vi.fn()
        })
      })
    })
  };

  return { mockRedisInstance: redis, mockChromium: chromium };
});

vi.mock('playwright-extra', () => ({
  chromium: mockChromium
}));

vi.mock('playwright-extra-plugin-stealth', () => ({
  default: vi.fn(() => ({ name: 'stealth' }))
}));

vi.mock('ioredis', () => ({
  default: vi.fn(() => mockRedisInstance)
}));

vi.mock('../../src/utils/logger.js', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }
}));

import SosVerificationService from '../../src/services/sosVerificationService.js';

const buildService = () => {
  return new SosVerificationService({
    redisConfig: {
      host: 'localhost',
      port: 6379
    }
  });
};

describe('SosVerificationService', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Reset mock implementations to defaults
    mockRedisInstance.lpush.mockResolvedValue(1);
    mockRedisInstance.rpush.mockResolvedValue(1);
    mockRedisInstance.blpop.mockResolvedValue(null);
    mockRedisInstance.setex.mockResolvedValue('OK');
    mockRedisInstance.get.mockResolvedValue(null);
    mockRedisInstance.llen.mockResolvedValue(0);
    mockRedisInstance.keys.mockResolvedValue([]);
  });

  it('configures redis listeners during construction', () => {
    buildService();

    expect(mockRedisInstance.on).toHaveBeenCalledWith('connect', expect.any(Function));
    expect(mockRedisInstance.on).toHaveBeenCalledWith('error', expect.any(Function));
    expect(mockRedisInstance.on).toHaveBeenCalledWith('close', expect.any(Function));
  });

  it('adds verification jobs to the redis queue', async () => {
    let payload;
    mockRedisInstance.lpush.mockImplementationOnce(async (queueName, body) => {
      payload = { queueName, body };
      return 1;
    });

    const service = buildService();
    const jobId = await service.addVerificationJob({
      businessName: 'Test Business',
      state: 'CA'
    });

    expect(typeof jobId).toBe('string');
    expect(jobId.startsWith('sos-')).toBe(true);
    expect(mockRedisInstance.lpush).toHaveBeenCalledTimes(1);
    expect(payload?.queueName).toBe('sos-verification-queue');

    const parsed = JSON.parse(payload?.body ?? '{}');
    expect(parsed.businessName).toBe('Test Business');
    expect(parsed.state).toBe('CA');
    expect(parsed).toHaveProperty('jobId');
    expect(parsed).toHaveProperty('timestamp');
  });

  it('propagates errors when redis push fails', async () => {
    const failure = new Error('lpush failed');
    mockRedisInstance.lpush.mockRejectedValueOnce(failure);

    const service = buildService();

    await expect(
      service.addVerificationJob({ businessName: 'Broken Inc', state: 'NV' })
    ).rejects.toThrow('lpush failed');
  });

  it('returns queue metrics from getQueueStatus', async () => {
    mockRedisInstance.llen.mockResolvedValueOnce(3);

    const service = buildService();
    const status = await service.getQueueStatus();

    expect(status.queueLength).toBe(3);
    expect(status.isProcessing).toBe(false);
    expect(status.activeResults).toBeDefined();
  });

  it('delegates processVerificationJob to verifyBusiness', async () => {
    const service = buildService();
    const result = { success: true };
    const spy = vi.spyOn(service, 'verifyBusiness').mockResolvedValue(result);

    const response = await service.processVerificationJob({ jobId: 'test' });

    expect(spy).toHaveBeenCalledWith({ jobId: 'test' });
    expect(response).toBe(result);
  });

  it('cleans up completed jobs with default count', async () => {
    const service = buildService();
    const cleaned = await service.cleanupCompletedJobs();

    expect(cleaned).toBe(5);
  });
});
