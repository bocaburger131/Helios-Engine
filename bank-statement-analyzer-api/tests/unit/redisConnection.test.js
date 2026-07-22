import { describe, it, expect, afterEach } from 'vitest';
import { getRedisConnectionOptions } from '../../src/config/redisConnection.js';

describe('getRedisConnectionOptions', () => {
  const saved = {};

  afterEach(() => {
    for (const key of ['NODE_ENV', 'USE_REDIS', 'REDIS_URL']) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  });

  function stashEnv() {
    for (const key of ['NODE_ENV', 'USE_REDIS', 'REDIS_URL']) {
      saved[key] = process.env[key];
    }
  }

  it('returns no-retry stub options when NODE_ENV is test', () => {
    stashEnv();
    process.env.NODE_ENV = 'test';
    delete process.env.USE_REDIS;
    delete process.env.REDIS_URL;

    const opts = getRedisConnectionOptions();
    expect(opts.lazyConnect).toBe(true);
    expect(opts.enableOfflineQueue).toBe(false);
    expect(opts.retryStrategy()).toBe(null);
  });

  it('returns no-retry stub options when USE_REDIS is false', () => {
    stashEnv();
    process.env.NODE_ENV = 'development';
    process.env.USE_REDIS = 'false';
    delete process.env.REDIS_URL;

    const opts = getRedisConnectionOptions();
    expect(opts.lazyConnect).toBe(true);
    expect(opts.enableOfflineQueue).toBe(false);
    expect(opts.retryStrategy()).toBe(null);
  });

  it('returns live host options when Redis is enabled', () => {
    stashEnv();
    process.env.NODE_ENV = 'development';
    process.env.USE_REDIS = 'true';
    delete process.env.REDIS_URL;

    const opts = getRedisConnectionOptions();
    expect(opts.host).toBeTruthy();
    expect(opts.retryStrategy).toBeUndefined();
  });
});
