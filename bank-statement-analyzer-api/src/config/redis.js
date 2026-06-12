import Redis from 'ioredis';
import logger from '../utils/logger.js';

/** Avoid Windows IPv6 localhost (::1) hangs against Docker-mapped Redis. */
function normalizeRedisUrl(url) {
  if (!url) return url;
  return url.replace(/\/\/localhost/i, '//127.0.0.1');
}

let redisClient = null;

// Skip Redis initialization in test environment
if (process.env.NODE_ENV === 'test' || process.env.USE_REDIS === 'false') {
  // Create a mock Redis client for testing
  redisClient = {
    connect: async () => Promise.resolve(),
    disconnect: async () => Promise.resolve(),
    get: async () => null,
    set: async () => 'OK',
    del: async () => 1,
    ping: async () => 'PONG',
    quit: async () => 'OK',
    on: () => {},
    // Stream methods for testing
    xadd: async () => '1234567890-0',
    xread: async () => [],
    xreadgroup: async () => [],
    xgroup: async () => 'OK',
    xack: async () => 1,
    xlen: async () => 0,
    xrange: async () => [],
    xrevrange: async () => [],
    xdel: async () => 1
  };
} else {
  // Production Redis configuration
  const redisConfig = {
    host: process.env.REDIS_HOST || '127.0.0.1',
    port: parseInt(process.env.REDIS_PORT || '6380', 10),
    password: process.env.REDIS_PASSWORD,
    db: process.env.REDIS_DB || 0,
    retryStrategy: (times) => {
      const delay = Math.min(times * 50, 2000);
      return delay;
    },
    maxRetriesPerRequest: 3,
    enableReadyCheck: true,
    enableOfflineQueue: true,
    lazyConnect: false,
  enableAutoPipelining: true,
  showFriendlyErrorStack: true,
  stringNumbers: true
  };

  if (process.env.REDIS_URL) {
    redisClient = new Redis(normalizeRedisUrl(process.env.REDIS_URL), {
      password: process.env.REDIS_PASSWORD || undefined,
      db: process.env.REDIS_DB || 0,
      retryStrategy: redisConfig.retryStrategy,
      maxRetriesPerRequest: redisConfig.maxRetriesPerRequest,
      enableReadyCheck: redisConfig.enableReadyCheck,
      enableOfflineQueue: redisConfig.enableOfflineQueue,
      lazyConnect: redisConfig.lazyConnect,
      enableAutoPipelining: redisConfig.enableAutoPipelining,
      showFriendlyErrorStack: redisConfig.showFriendlyErrorStack,
      stringNumbers: redisConfig.stringNumbers
    });
  } else {
    redisClient = new Redis(redisConfig);
  }

  redisClient.on('connect', () => {
    logger.info('Redis client connected');
  });

  redisClient.on('error', (err) => {
    logger.error('Redis client error:', err);
  });

  redisClient.on('ready', () => {
    logger.info('Redis client ready');
  });
}

export const connectRedis = async () => {
  if (process.env.NODE_ENV === 'test' || process.env.USE_REDIS === 'false') {
    logger.info('Redis mocked for testing');
    return;
  }
  
  try {
    await redisClient.ping();
    logger.info('Redis connection established');
  } catch (error) {
    logger.error('Failed to connect to Redis:', error);
    throw error;
  }
};

export const disconnectRedis = async () => {
  if (process.env.NODE_ENV === 'test' || process.env.USE_REDIS === 'false') {
    return;
  }
  
  if (redisClient) {
    await redisClient.quit();
    logger.info('Redis connection closed');
  }
};

export { redisClient };
export default redisClient;