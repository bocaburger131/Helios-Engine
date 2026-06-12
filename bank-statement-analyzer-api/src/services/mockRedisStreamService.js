/**
 * Mock Redis Streams Service for Development Testing
 * This provides a fallback when Redis Streams is not available
 */

import { EventEmitter } from 'events';
import logger from '../utils/logger.js';

class MockRedisStreamService extends EventEmitter {
  constructor() {
    super();
    
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

    this.consumerGroups = {
      PARSING_WORKERS: 'parsing-workers',
      CATEGORIZATION_WORKERS: 'categorization-workers',
      ANALYSIS_WORKERS: 'analysis-workers',
      RISK_WORKERS: 'risk-workers',
      ALERT_WORKERS: 'alert-workers',
      NOTIFICATION_WORKERS: 'notification-workers'
    };

    this.isConnected = false;
    this.workers = new Map();
    this.messageStore = new Map(); // In-memory message store
    this.messageId = 1;

    // Auto-initialize in mock mode
    setTimeout(() => this.initialize(), 100);
  }

  async initialize() {
    try {
      this.isConnected = true;
      logger.info('Mock Redis Streams service initialized for development');
      this.emit('connected');
    } catch (error) {
      logger.error('Mock Redis Streams initialization failed:', error);
    }
  }

  async addToStream(streamName, data, options = {}) {
    if (!this.isConnected) {
      throw new Error('Mock Redis Streams service not connected');
    }

    const messageId = `${Date.now()}-${this.messageId++}`;
    
    // Store message in memory
    if (!this.messageStore.has(streamName)) {
      this.messageStore.set(streamName, []);
    }
    
    const message = {
      id: messageId,
      data,
      timestamp: Date.now(),
      processed: false
    };
    
    this.messageStore.get(streamName).push(message);
    
    logger.info(`Mock message added to stream ${streamName}`, {
      messageId,
      streamName,
      dataKeys: Object.keys(data)
    });

    // Simulate processing workers
    setTimeout(() => {
      this.processMessage(streamName, message);
    }, options.delay || 10);

    return messageId;
  }

  async processMessage(streamName, message) {
    try {
      // Mark as processed
      message.processed = true;
      
      logger.info(`Mock processed message ${message.id} from stream ${streamName}`, {
        messageId: message.id,
        streamName,
        processingTime: Date.now() - message.timestamp
      });

      // Emit processing event
      this.emit('messageProcessed', {
        streamName,
        messageId: message.id,
        data: message.data
      });

    } catch (error) {
      logger.error(`Mock message processing failed for ${message.id}:`, error);
    }
  }

  async startWorker(streamName, consumerGroup, consumerName, processingFunction, options = {}) {
    const workerId = `${consumerName}-${Date.now()}`;
    
    const worker = {
      id: workerId,
      streamName,
      consumerGroup,
      consumerName,
      processingFunction,
      active: true,
      startTime: Date.now(),
      messagesProcessed: 0,
      lastActivity: Date.now()
    };

    this.workers.set(workerId, worker);
    
    logger.info(`Mock worker ${workerId} started for stream ${streamName}`);

    // Simulate worker processing with mock messages
    this.simulateWorkerActivity(worker);

    return workerId;
  }

  async simulateWorkerActivity(worker) {
    if (!worker.active) return;

    // Process messages from the stream
    const streamMessages = this.messageStore.get(worker.streamName) || [];
    const unprocessedMessages = streamMessages.filter(msg => !msg.processed);

    if (unprocessedMessages.length > 0) {
      const message = unprocessedMessages[0];
      
      try {
        if (typeof worker.processingFunction === 'function') {
          await worker.processingFunction(message.data, message.id);
        }
        
        message.processed = true;
        worker.messagesProcessed++;
        worker.lastActivity = Date.now();

        logger.info(`Mock worker ${worker.id} processed message ${message.id}`);
      } catch (error) {
        logger.error(`Mock worker ${worker.id} failed to process message ${message.id}:`, error);
      }
    }

    // Schedule next processing cycle
    if (worker.active) {
      setTimeout(() => this.simulateWorkerActivity(worker), 1000);
    }
  }

  async stopWorker(workerId) {
    const worker = this.workers.get(workerId);
    if (worker) {
      worker.active = false;
      this.workers.delete(workerId);
      logger.info(`Mock worker ${workerId} stopped`);
    }
  }

  async stopAllWorkers() {
    logger.info('Stopping all mock workers...');
    for (const [workerId, worker] of this.workers) {
      worker.active = false;
    }
    this.workers.clear();
    logger.info('All mock workers stopped');
  }

  async getStreamInfo(streamName) {
    const messages = this.messageStore.get(streamName) || [];
    return {
      name: streamName,
      length: messages.length,
      processedCount: messages.filter(msg => msg.processed).length,
      pendingCount: messages.filter(msg => !msg.processed).length,
      firstEntry: messages[0]?.id || null,
      lastEntry: messages[messages.length - 1]?.id || null
    };
  }

  async getWorkerStats() {
    const stats = {};
    for (const [workerId, worker] of this.workers) {
      stats[workerId] = {
        id: workerId,
        streamName: worker.streamName,
        consumerGroup: worker.consumerGroup,
        consumerName: worker.consumerName,
        active: worker.active,
        messagesProcessed: worker.messagesProcessed,
        uptime: Date.now() - worker.startTime,
        lastActivity: worker.lastActivity
      };
    }
    return stats;
  }

  async getComprehensiveStats() {
    const streamStats = {};
    for (const streamName of Object.values(this.streams)) {
      streamStats[streamName] = await this.getStreamInfo(streamName);
    }

    return {
      connected: this.isConnected,
      totalStreams: Object.keys(this.streams).length,
      totalWorkers: this.workers.size,
      streams: streamStats,
      workers: await this.getWorkerStats(),
      memoryUsage: {
        totalMessages: Array.from(this.messageStore.values()).reduce((sum, msgs) => sum + msgs.length, 0),
        streamsWithData: Array.from(this.messageStore.keys()).length
      }
    };
  }

  async disconnect() {
    try {
      await this.stopAllWorkers();
      this.isConnected = false;
      this.messageStore.clear();
      logger.info('Mock Redis Streams service disconnected');
    } catch (error) {
      logger.error('Error disconnecting mock Redis Streams service:', error);
    }
  }

  // Additional mock methods for compatibility
  async processPendingMessages() {
    logger.info('Mock: processPendingMessages called');
    return { processed: 0, pending: 0 };
  }

  async handleProcessingError(streamName, consumerGroup, messageId, fields, error) {
    logger.warn(`Mock: Processing error for message ${messageId} in stream ${streamName}:`, error.message);
  }

  async addToDeadLetterQueue(streamName, messageId, data, error) {
    logger.warn(`Mock: Message ${messageId} added to dead letter queue for stream ${streamName}`);
  }

  async waitForReconnection() {
    // In mock mode, always "connected"
    return Promise.resolve();
  }
}

export default new MockRedisStreamService();
