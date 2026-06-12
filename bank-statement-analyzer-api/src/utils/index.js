// Re-export all utilities
export * from './errors.js';
export { default as logger } from './logger.js';

// Cache service implementation
class CacheService {
  constructor() {
    this.cache = new Map();
  }

  async get(key) {
    return this.cache.get(key) || null;
  }

  async set(key, value, ttl = 3600) {
    this.cache.set(key, value);
    // In a real implementation, we'd handle TTL
    return true;
  }

  async del(key) {
    return this.cache.delete(key);
  }

  async clear() {
    this.cache.clear();
    return true;
  }
}

export const cacheService = new CacheService();
