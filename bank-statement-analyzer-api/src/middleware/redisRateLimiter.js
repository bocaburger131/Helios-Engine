import { RateLimiterRedis, RateLimiterMemory } from 'rate-limiter-flexible';
import Redis from 'ioredis';
import config from '../config/env.js';

// Create Redis client only if not in test environment
let redisClient = null;
if (process.env.NODE_ENV !== 'test') {
  try {
    redisClient = new Redis({
      host: config.redis?.host || 'localhost',
      port: config.redis?.port || 6379,
      password: config.redis?.password,
      db: config.redis?.db || 0,
      retryStrategy: (times) => {
        const delay = Math.min(times * 50, 2000);
        return delay;
      },
      maxRetriesPerRequest: 3
    });
  } catch (error) {
    console.warn('Redis connection failed, using memory rate limiter:', error.message);
  }
}

// Export rate limiter class
class RedisRateLimiter {
  constructor(options) {
    this.options = options;
    
    if (process.env.NODE_ENV === 'test') {
      // Mock implementation for tests
      this.limiter = {
        consume: async () => ({ remainingPoints: 100, msBeforeNext: 0 })
      };
    } else if (redisClient) {
      this.limiter = new RateLimiterRedis({
        storeClient: redisClient,
        keyPrefix: 'rlflx',
        points: options.points || 10,
        duration: options.duration || 1,
        ...options
      });
    } else {
      // Fallback to memory limiter if Redis is not available
      this.limiter = new RateLimiterMemory(options);
    }
  }

  async consume(key, points = 1) {
    return this.limiter.consume(key, points);
  }
}

// Export as default
export default RedisRateLimiter;