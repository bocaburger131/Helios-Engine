import { createClient } from 'redis';
import config from '../config/env.js';
import logger from '../utils/logger.js';

class RedisService {
  constructor() {
    this.isConnected = false;
    this.connectionPromise = null;
    this.client = null;
    this.isMocked = process.env.NODE_ENV === 'test' || process.env.REDIS_MOCK === 'true';
    this.useRedis = process.env.USE_REDIS !== 'false';
  }

  // A robust, singleton-style connection method
  async connect() {
    // Skip connection if Redis is disabled
    if (!this.useRedis) {
      logger.info('Redis is disabled by configuration');
      this.isConnected = false;
      return;
    }

    if (!this.connectionPromise) {
      this.connectionPromise = this._connectInternal();
    }
    return this.connectionPromise;
  }

  async _connectInternal() {
    try {
      // Use mock in test environment
      if (this.isMocked) {
        logger.info('Using Redis mock for testing');
        // Create a simple mock client
        this.client = this._createMockClient();
        this.isConnected = true;
        return;
      }

      // Determine Redis connection options based on the environment
      const isProduction = config.NODE_ENV === 'production';
      
      // In production, use the Redis URL from your environment variables.
      // For local development, connect to the standard localhost port.
      const redisUrl = isProduction 
        ? `redis://${config.REDIS_HOST}:${config.REDIS_PORT}`
        : 'redis://localhost:6379';

      this.client = createClient({ url: redisUrl });

      this.client.on('error', (err) => {
        logger.error('Redis Client Error', err);
        this.isConnected = false;
      });
      this.client.on('connect', () => logger.info('Redis client connecting...'));
      this.client.on('ready', () => logger.info('Redis client is ready.'));

      await this.client.connect();
      this.isConnected = true;
      logger.info('Successfully connected to Redis.');
    } catch (err) {
      logger.error('Failed to connect to Redis:', err);
      
      // In test/development, fallback to mock
      if (config.NODE_ENV !== 'production') {
        logger.warn('Falling back to Redis mock');
        this.client = this._createMockClient();
        this.isConnected = true;
        this.isMocked = true;
      } else {
        this.connectionPromise = null; // Allow future connection attempts
        throw err;
      }
    }
  }

  _createMockClient() {
    const store = new Map();

    const globToRegExp = (pattern) => {
      const escaped = String(pattern || '')
        .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
        .replace(/\*/g, '.*');
      return new RegExp(`^${escaped}$`);
    };

    return {
      connect: async () => {},
      disconnect: async () => {},
      quit: async () => {},
      get: async (key) => store.get(key) || null,
      set: async (key, value, options) => {
        store.set(key, value);
        if (options?.EX) {
          setTimeout(() => store.delete(key), options.EX * 1000);
        }
        return 'OK';
      },
      del: async (keyOrKeys) => {
        const keys = Array.isArray(keyOrKeys) ? keyOrKeys : [keyOrKeys];
        let n = 0;
        for (const key of keys) {
          if (store.delete(key)) n += 1;
        }
        return n;
      },
      async *scanIterator({ MATCH = '*', COUNT: _count = 100 } = {}) {
        const re = globToRegExp(MATCH);
        for (const key of store.keys()) {
          if (re.test(key)) yield key;
        }
      },
      exists: async (key) => store.has(key) ? 1 : 0,
      flushDb: async () => {
        store.clear();
        return 'OK';
      },
      flushall: async () => {
        store.clear();
        return 'OK';
      },
      expire: async (key, seconds) => {
        if (store.has(key)) {
          setTimeout(() => store.delete(key), seconds * 1000);
          return 1;
        }
        return 0;
      },
      ping: async () => 'PONG'
    };
  }

  async disconnect() {
    try {
      if (this.isMocked) {  // Fixed: Added parentheses around the condition
        return;
      }
      
      if (this.client && this.client.isOpen) {
        await this.client.quit();
        this.client = null;
      }
    } catch (error) {
      console.error('Error disconnecting from Redis:', error);
    }
  }

  async get(key) {
    if (!this.useRedis || !this.isConnected) return null;
    
    try {
      return await this.client.get(key);
    } catch (error) {
      logger.error(`Redis GET error for key ${key}:`, error);
      return null;
    }
  }

  async set(key, value, expirationInSeconds = 3600) {
    if (!this.useRedis || !this.isConnected) return false;
    
    try {
      const stringValue = typeof value === 'string' ? value : JSON.stringify(value);
      
      if (this.isMocked) {
        await this.client.set(key, stringValue);
        if (expirationInSeconds) {
          await this.client.expire(key, expirationInSeconds);
        }
      } else {
        await this.client.set(key, stringValue, {
          EX: expirationInSeconds
        });
      }
      return true;
    } catch (error) {
      logger.error(`Redis SET error for key ${key}:`, error);
      return false;
    }
  }

  async del(key) {
    if (!this.useRedis || !this.isConnected) return false;
    
    try {
      await this.client.del(key);
      return true;
    } catch (error) {
      logger.error(`Redis DEL error for key ${key}:`, error);
      return false;
    }
  }

  async exists(key) {
    if (!this.useRedis || !this.isConnected) return false;
    
    try {
      return await this.client.exists(key) === 1;
    } catch (error) {
      logger.error(`Redis EXISTS error for key ${key}:`, error);
      return false;
    }
  }

  async flush() {
    if (!this.useRedis || !this.isConnected) return false;
    
    try {
      if (this.isMocked || this.client.flushall) {
        await this.client.flushall();
      } else {
        await this.client.flushDb();
      }
      return true;
    } catch (error) {
      logger.error('Redis FLUSH error:', error);
      return false;
    }
  }

  async getJSON(key) {
    const value = await this.get(key);
    if (!value) return null;
    
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }

  async healthCheck() {
    if (!this.useRedis) {
      return { status: 'disabled', connected: false };
    }
    
    if (this.isMocked) {
      return { status: 'mocked', connected: true };
    }
    
    try {
      if (!this.isConnected) {
        await this.connect();
      }
      await this.client.ping();
      return { status: 'healthy', connected: true };
    } catch (error) {
      return { status: 'unhealthy', connected: false, error: error.message };
    }
  }

  // Statement Analysis Caching Methods
  async cacheAnalysis(key, analysisData, ttl = 3600) {
    try {
      if (!this.useRedis) {
        this.logger.warn('Redis disabled - caching to memory');
        this.cache.set(key, JSON.stringify(analysisData));
        return true;
      }

      if (!this.isConnected) {
        await this.connect();
      }

      const serializedData = JSON.stringify({
        ...analysisData,
        cachedAt: new Date().toISOString(),
        ttl: ttl
      });

      await this.client.setex(key, ttl, serializedData);
      this.logger.info(`Analysis cached with key: ${key}, TTL: ${ttl}s`);
      return true;
    } catch (error) {
      this.logger.error('Failed to cache analysis:', error);
      return false;
    }
  }

  async getCachedAnalysis(key) {
    try {
      if (!this.useRedis) {
        const cached = this.cache.get(key);
        return cached ? JSON.parse(cached) : null;
      }

      if (!this.isConnected) {
        await this.connect();
      }

      const cachedData = await this.client.get(key);
      if (!cachedData) {
        return null;
      }

      const analysis = JSON.parse(cachedData);
      this.logger.info(`Analysis retrieved from cache: ${key}`);
      return analysis;
    } catch (error) {
      this.logger.error('Failed to retrieve cached analysis:', error);
      return null;
    }
  }

  async deleteCachedAnalysis(key) {
    try {
      if (!this.useRedis) {
        this.cache.delete(key);
        return true;
      }

      if (!this.isConnected) {
        await this.connect();
      }

      const result = await this.client.del(key);
      this.logger.info(`Analysis cache deleted: ${key}, result: ${result}`);
      return result > 0;
    } catch (error) {
      this.logger.error('Failed to delete cached analysis:', error);
      return false;
    }
  }

  async cacheStatement(statementId, statementData, ttl = 7200) {
    try {
      const key = `statement:${statementId}`;
      return await this.cacheAnalysis(key, statementData, ttl);
    } catch (error) {
      this.logger.error('Failed to cache statement:', error);
      return false;
    }
  }

  async getCachedStatement(statementId) {
    try {
      const key = `statement:${statementId}`;
      return await this.getCachedAnalysis(key);
    } catch (error) {
      this.logger.error('Failed to retrieve cached statement:', error);
      return null;
    }
  }

  async cacheRiskAnalysis(statementId, riskData, ttl = 3600) {
    try {
      const key = `risk:${statementId}`;
      return await this.cacheAnalysis(key, riskData, ttl);
    } catch (error) {
      this.logger.error('Failed to cache risk analysis:', error);
      return false;
    }
  }

  async getCachedRiskAnalysis(statementId) {
    try {
      const key = `risk:${statementId}`;
      return await this.getCachedAnalysis(key);
    } catch (error) {
      this.logger.error('Failed to retrieve cached risk analysis:', error);
      return null;
    }
  }

  async cachePerplexityAnalysis(statementId, analysisData, ttl = 1800) {
    try {
      const key = `perplexity:${statementId}`;
      return await this.cacheAnalysis(key, analysisData, ttl);
    } catch (error) {
      this.logger.error('Failed to cache Perplexity analysis:', error);
      return false;
    }
  }

  async getCachedPerplexityAnalysis(statementId) {
    try {
      const key = `perplexity:${statementId}`;
      return await this.getCachedAnalysis(key);
    } catch (error) {
      this.logger.error('Failed to retrieve cached Perplexity analysis:', error);
      return null;
    }
  }

  async clearStatementCache(statementId) {
    try {
      const keys = [
        `statement:${statementId}`,
        `risk:${statementId}`,
        `perplexity:${statementId}`
      ];

      let deletedCount = 0;
      for (const key of keys) {
        const deleted = await this.deleteCachedAnalysis(key);
        if (deleted) deletedCount++;
      }

      this.logger.info(`Cleared ${deletedCount} cache entries for statement: ${statementId}`);
      return deletedCount;
    } catch (error) {
      this.logger.error('Failed to clear statement cache:', error);
      return 0;
    }
  }

  async getCacheStats() {
    try {
      if (!this.useRedis) {
        return {
          type: 'memory',
          size: this.cache.size,
          connected: false
        };
      }

      if (!this.isConnected) {
        await this.connect();
      }

      const info = await this.client.info('memory');
      const keyspace = await this.client.info('keyspace');
      
      return {
        type: 'redis',
        connected: this.isConnected,
        memory: info,
        keyspace: keyspace
      };
    } catch (error) {
      this.logger.error('Failed to get cache stats:', error);
      return { error: error.message };
    }
  }
}

// Export a singleton instance
let redisServiceInstance = null;

export function getRedisService() {
  if (!redisServiceInstance) {
    redisServiceInstance = new RedisService();
  }
  return redisServiceInstance;
}

export default getRedisService();