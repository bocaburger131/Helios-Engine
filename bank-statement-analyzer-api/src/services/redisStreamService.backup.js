/**
 * Redis Streams Service - Production Ready Implementation
 * 
 * This service integrates with the AI categorization caching system
 * to provide efficient, scalable transaction processing using Redis Streams.
 */

import Redis from 'ioredis';
import logger from '../utils/logger.js';
import { EventEmitter } from 'events';

class RedisStreamService extends EventEmitter {
  constructor() {
    super();
    
    if (process.env.SKIP_REDIS === 'true') {
      logger.warn('Redis is disabled. Running without Redis functionality.');
      return;
    }
    
    this.redis = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: process.env.REDIS_PORT || 6379,
      password: process.env.REDIS_PASSWORD,
      username: process.env.REDIS_USERNAME,
      retryDelayOnFailover: 100,
      enableReadyCheck: false,
      maxRetriesPerRequest: null,
      lazyConnect: true,
      keepAlive: 30000,
      family: 4,
      connectTimeout: 10000,
      commandTimeout: 5000,
    });

    // Stream configuration
    this.streams = {
      STATEMENT_UPLOAD: 'stream:statement:upload',
      STATEMENT_PARSING: 'stream:statement:parsing',
      TRANSACTION_CATEGORIZATION: 'stream:transaction:categorization',
      TRANSACTION_ANALYSIS: 'stream:transaction:analysis',
      RISK_ANALYSIS: 'stream:risk:analysis',
      ALERT_GENERATION: 'stream:alert:generation',
      NOTIFICATION: 'stream:notification',
      AUDIT_LOG: 'stream:audit:log'
    };

    // Consumer groups for horizontal scaling
    this.consumerGroups = {
      PARSING_WORKERS: 'parsing-workers',
      CATEGORIZATION_WORKERS: 'categorization-workers',
      ANALYSIS_WORKERS: 'analysis-workers',
      RISK_WORKERS: 'risk-workers',
      ALERT_WORKERS: 'alert-workers',
      NOTIFICATION_WORKERS: 'notification-workers'
    };

    this.initialize().catch(err => {
      logger.error('Failed to initialize Redis Streams:', err);
    });
  }

  async initialize() {
    try {
      await this.redis.connect();
      logger.info('Redis Streams service connected successfully');
      
      // Initialize all streams and consumer groups
      logger.info('Initializing Redis streams and consumer groups...');
      
      for (const stream of Object.values(this.streams)) {
        for (const group of Object.values(this.consumerGroups)) {
          try {
            await this.redis.xgroup('CREATE', stream, group, '$', 'MKSTREAM');
          } catch (error) {
            if (!error.message.includes('BUSYGROUP')) {
              logger.error(`Error creating consumer group ${group} for ${stream}:`, error);
            }
          }
        }
      }

      logger.info('Redis streams initialization completed');
    } catch (error) {
      logger.error('Failed to connect to Redis:', error);
      throw error;
    }
  }

  async addJobToStream(streamName, jobData) {
    try {
      // Add job to stream with auto-generated ID
      const jobId = await this.redis.xadd(
        streamName,
        '*',
        'data',
        JSON.stringify({
          ...jobData,
          timestamp: Date.now()
        })
      );

      logger.debug(`Added job to stream ${streamName}:`, { jobId, jobData });
      return jobId;
    } catch (error) {
      logger.error(`Error adding job to stream ${streamName}:`, error);
      throw error;
    }
  }

  async processStreamWithGroup(streamName, groupName, processingFunction) {
    const consumerName = `consumer-${process.pid}-${Date.now()}`;
    logger.info(`Starting stream processor for ${streamName}:${groupName}:${consumerName}`);

    while (true) {
      try {
        // Read new messages
        const response = await this.redis.xreadgroup(
          'GROUP', groupName, consumerName,
          'COUNT', 1,
          'BLOCK', 5000,
          'STREAMS', streamName, '>'
        );

        if (!response || !response.length) {
          continue;
        }

        const [_, messages] = response[0];
        const [messageId, [__, jobDataString]] = messages[0];
        const jobData = JSON.parse(jobDataString);

        // Process the job
        await processingFunction(jobData);

        // Acknowledge successful processing
        await this.redis.xack(streamName, groupName, messageId);
        
        logger.debug(`Processed message ${messageId} from ${streamName}`);
      } catch (error) {
        logger.error(`Error processing stream ${streamName}:`, error);
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
    }
  }

  async getStreamLength(streamName) {
    try {
      return await this.redis.xlen(streamName);
    } catch (error) {
      logger.error(`Error getting length for stream ${streamName}:`, error);
      throw error;
    }
  }

  async getStreamInfo(streamName) {
    try {
      const info = await this.redis.xinfo('STREAM', streamName);
      return info;
    } catch (error) {
      logger.error(`Error getting info for stream ${streamName}:`, error);
      throw error;
    }
  }

  async getPendingCount(streamName, groupName) {
    try {
      const info = await this.redis.xpending(streamName, groupName);
      return info[0] || 0;
    } catch (error) {
      logger.error(`Error getting pending count for ${streamName}:${groupName}:`, error);
      throw error;
    }
  }

  async cleanupStaleMessages(streamName, groupName, threshold = 3600000) {
    try {
      const pending = await this.redis.xpending(streamName, groupName);
      if (!pending[0]) return;

      const staleMessages = await this.redis.xpending(
        streamName,
        groupName,
        '-',
        '+',
        10,
        'consumer-placeholder'
      );

      for (const message of staleMessages) {
        const [messageId, consumer, elapsed] = message;
        if (elapsed > threshold) {
          await this.redis.xack(streamName, groupName, messageId);
          logger.info(`Cleaned up stale message ${messageId} from ${streamName}`);
        }
      }
    } catch (error) {
      logger.error(`Error cleaning up stale messages for ${streamName}:${groupName}:`, error);
    }
  }
}

// Export singleton instance
const redisStreamService = new RedisStreamService();
export default redisStreamService;