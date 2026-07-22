/**
 * Shared Redis connection options for ioredis and BullMQ.
 * @license Copyright (c) 2025 Shift 4 Financial INC
 */

const DEFAULT_PORT = 6380;

/** Avoid Windows IPv6 localhost (::1) issues against Docker-mapped Redis. */
function normalizeRedisUrl(url) {
  if (!url) return url;
  return url.replace(/\/\/localhost/i, '//127.0.0.1');
}

/**
 * Single source of truth for the USE_REDIS switch: Redis is ON unless running
 * tests or explicitly disabled with USE_REDIS=false. All consumers (env.js,
 * redis.js, queue availability, progress store) must use this helper.
 */
export function isRedisDisabled() {
  return process.env.NODE_ENV === 'test' || process.env.USE_REDIS === 'false';
}

function getDisabledRedisConnectionOptions() {
  return {
    host: '127.0.0.1',
    port: 1,
    maxRetriesPerRequest: 1,
    lazyConnect: true,
    enableOfflineQueue: false,
    retryStrategy: () => null
  };
}

/**
 * BullMQ / ioredis connection object.
 * @returns {import('bullmq').ConnectionOptions}
 */
export function getRedisConnectionOptions() {
  if (isRedisDisabled()) {
    return getDisabledRedisConnectionOptions();
  }

  if (process.env.REDIS_URL) {
    return {
      url: normalizeRedisUrl(process.env.REDIS_URL),
      password: process.env.REDIS_PASSWORD || undefined,
      maxRetriesPerRequest: null,
    };
  }
  return {
    host: process.env.REDIS_HOST || '127.0.0.1',
    port: Number(process.env.REDIS_PORT || DEFAULT_PORT),
    password: process.env.REDIS_PASSWORD || undefined,
    db: Number(process.env.REDIS_DB || 0),
    maxRetriesPerRequest: null,
  };
}

/** @alias getRedisConnectionOptions */
export const getBullMqConnection = getRedisConnectionOptions;

export default getRedisConnectionOptions;
