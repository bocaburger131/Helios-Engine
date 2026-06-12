import { RateLimiterRedis, RateLimiterMemory } from 'rate-limiter-flexible';
import Redis from 'ioredis';
import config from '../config/config.js';
import logger from '../utils/logger.js';

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

// Simple rate limiter implementation without Redis
class SimpleRateLimiter {
  constructor(options) {
    this.windowMs = options.windowMs || 60000; // 1 minute default
    this.max = options.max || 100;
    this.requests = new Map();
  }

  async consume(key, points = 1) {
    const now = Date.now();
    const userRequests = this.requests.get(key) || [];
    
    // Remove old requests outside the window
    const validRequests = userRequests.filter(time => now - time < this.windowMs);
    
    if (validRequests.length >= this.max) {
      throw new Error('Too many requests');
    }
    
    validRequests.push(now);
    this.requests.set(key, validRequests);
    
    return {
      remainingPoints: this.max - validRequests.length,
      msBeforeNext: this.windowMs
    };
  }
}

export default RedisRateLimiter;