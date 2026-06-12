import { getRedisService } from '../services/RedisService.js';
import logger from '../utils/logger.js';

export const cacheMiddleware = (keyPrefix, ttlSeconds = 300) => {
  return async (req, res, next) => {
    // Skip caching for non-GET requests
    if (req.method !== 'GET') {
      return next();
    }

    // Skip if Redis is disabled
    if (process.env.USE_REDIS === 'false') {
      return next();
    }

    try {
      const redis = await getRedisService();
      const cacheKey = `${keyPrefix}:${req.originalUrl || req.url}`;
      
      // Try to get from cache
      const cached = await redis.getJSON(cacheKey);
      if (cached) {
        logger.debug(`Cache hit for ${cacheKey}`);
        return res.json(cached);
      }

      // Store original json method
      const originalJson = res.json;
      
      // Override json method to cache the response
      res.json = function(data) {
        // Cache the response asynchronously
        redis.set(cacheKey, data, ttlSeconds).catch(err => {
          logger.error('Failed to cache response:', err);
        });
        
        // Call original json method
        return originalJson.call(this, data);
      };

      next();
    } catch (error) {
      logger.error('Cache middleware error:', error);
      // Continue without caching on error
      next();
    }
  };
};

// Cache invalidation helper
export const invalidateCache = async (pattern) => {
  try {
    const redis = await getRedisService();
    // This is a simple implementation - for production, you might want to use Redis SCAN
    await redis.flush(); // Or implement pattern-based deletion
  } catch (error) {
    logger.error('Cache invalidation error:', error);
  }
};