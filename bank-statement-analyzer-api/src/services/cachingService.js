/**
 * Caching Service for Bank Statement Analysis
 */

import Redis from 'ioredis';
import logger from '../utils/logger.js';
import { jobMetrics } from '../monitoring/metrics.js';

class CachingService {
  constructor() {
    this.redis = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: process.env.REDIS_PORT || 6379,
      password: process.env.REDIS_PASSWORD,
      username: process.env.REDIS_USERNAME,
      retryDelayOnFailover: 100,
      enableReadyCheck: false,
      maxRetriesPerRequest: null,
      lazyConnect: true
    });

    // Cache configuration
    this.config = {
      TTL: {
        ANALYSIS_RESULTS: 24 * 60 * 60,  // 24 hours
        JOB_STATUS: 60 * 60,             // 1 hour
        PDF_HASH: 7 * 24 * 60 * 60,      // 7 days
        CATEGORIZATION: 30 * 24 * 60 * 60 // 30 days
      },
      PREFIX: {
        ANALYSIS: 'cache:analysis:',
        JOB: 'cache:job:',
        PDF: 'cache:pdf:',
        CATEGORIZATION: 'cache:cat:'
      }
    };

    // Initialize performance metrics
    this.initializeMetrics();
  }

  /**
   * Initialize cache metrics
   */
  initializeMetrics() {
    this.metrics = {
      hits: jobMetrics.counter({
        name: 'cache_hits_total',
        help: 'Total number of cache hits',
        labelNames: ['type']
      }),
      misses: jobMetrics.counter({
        name: 'cache_misses_total',
        help: 'Total number of cache misses',
        labelNames: ['type']
      }),
      size: jobMetrics.gauge({
        name: 'cache_size_bytes',
        help: 'Size of cached data in bytes',
        labelNames: ['type']
      })
    };
  }

  /**
   * Cache analysis results
   */
  async cacheAnalysisResults(dealId, results) {
    const key = `${this.config.PREFIX.ANALYSIS}${dealId}`;
    try {
      await this.redis.set(key, JSON.stringify(results), 'EX', this.config.TTL.ANALYSIS_RESULTS);
      await this.updateCacheMetrics('analysis');
      logger.debug(`Cached analysis results for deal ${dealId}`);
    } catch (error) {
      logger.error('Error caching analysis results:', error);
      throw error;
    }
  }

  /**
   * Get cached analysis results
   */
  async getAnalysisResults(dealId) {
    const key = `${this.config.PREFIX.ANALYSIS}${dealId}`;
    try {
      const cached = await this.redis.get(key);
      
      if (cached) {
        this.metrics.hits.inc({ type: 'analysis' });
        return JSON.parse(cached);
      }
      
      this.metrics.misses.inc({ type: 'analysis' });
      return null;
    } catch (error) {
      logger.error('Error getting cached analysis results:', error);
      return null;
    }
  }

  /**
   * Cache PDF hash for duplicate detection
   */
  async cachePdfHash(hash, metadata) {
    const key = `${this.config.PREFIX.PDF}${hash}`;
    try {
      await this.redis.set(key, JSON.stringify(metadata), 'EX', this.config.TTL.PDF_HASH);
      await this.updateCacheMetrics('pdf');
    } catch (error) {
      logger.error('Error caching PDF hash:', error);
      throw error;
    }
  }

  /**
   * Check if PDF has been processed before
   */
  async checkPdfHash(hash) {
    const key = `${this.config.PREFIX.PDF}${hash}`;
    try {
      const cached = await this.redis.get(key);
      
      if (cached) {
        this.metrics.hits.inc({ type: 'pdf' });
        return JSON.parse(cached);
      }
      
      this.metrics.misses.inc({ type: 'pdf' });
      return null;
    } catch (error) {
      logger.error('Error checking PDF hash:', error);
      return null;
    }
  }

  /**
   * Cache transaction categorization
   */
  async cacheTransactionCategorization(transactionId, category) {
    const key = `${this.config.PREFIX.CATEGORIZATION}${transactionId}`;
    try {
      await this.redis.set(key, JSON.stringify(category), 'EX', this.config.TTL.CATEGORIZATION);
      await this.updateCacheMetrics('categorization');
    } catch (error) {
      logger.error('Error caching transaction categorization:', error);
      throw error;
    }
  }

  /**
   * Get cached transaction categorization
   */
  async getTransactionCategorization(transactionId) {
    const key = `${this.config.PREFIX.CATEGORIZATION}${transactionId}`;
    try {
      const cached = await this.redis.get(key);
      
      if (cached) {
        this.metrics.hits.inc({ type: 'categorization' });
        return JSON.parse(cached);
      }
      
      this.metrics.misses.inc({ type: 'categorization' });
      return null;
    } catch (error) {
      logger.error('Error getting cached categorization:', error);
      return null;
    }
  }

  /**
   * Update cache size metrics
   */
  async updateCacheMetrics(type) {
    try {
      const keys = await this.redis.keys(`${this.config.PREFIX[type.toUpperCase()]}*`);
      let totalSize = 0;
      
      for (const key of keys) {
        const value = await this.redis.get(key);
        totalSize += Buffer.byteLength(value, 'utf8');
      }
      
      this.metrics.size.set({ type }, totalSize);
    } catch (error) {
      logger.error('Error updating cache metrics:', error);
    }
  }

  /**
   * Clear expired cache entries
   */
  async clearExpiredCache() {
    try {
      for (const prefix of Object.values(this.config.PREFIX)) {
        const keys = await this.redis.keys(`${prefix}*`);
        for (const key of keys) {
          const ttl = await this.redis.ttl(key);
          if (ttl <= 0) {
            await this.redis.del(key);
            logger.debug(`Cleared expired cache key: ${key}`);
          }
        }
      }
    } catch (error) {
      logger.error('Error clearing expired cache:', error);
    }
  }

  /**
   * Get cache statistics
   */
  async getCacheStats() {
    const stats = {
      hits: {},
      misses: {},
      size: {},
      totalKeys: 0
    };

    try {
      for (const type of Object.keys(this.config.PREFIX)) {
        const keys = await this.redis.keys(`${this.config.PREFIX[type]}*`);
        stats.totalKeys += keys.length;
        
        const hitCounter = await this.metrics.hits.get({ type: type.toLowerCase() });
        const missCounter = await this.metrics.misses.get({ type: type.toLowerCase() });
        const sizeGauge = await this.metrics.size.get({ type: type.toLowerCase() });
        
        stats.hits[type] = hitCounter?.value || 0;
        stats.misses[type] = missCounter?.value || 0;
        stats.size[type] = sizeGauge?.value || 0;
      }

      return stats;
    } catch (error) {
      logger.error('Error getting cache stats:', error);
      throw error;
    }
  }
}

export default new CachingService();
