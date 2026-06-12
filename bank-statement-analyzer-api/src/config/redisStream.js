import Redis from 'ioredis';
import config from './config.js';
import logger from '../utils/logger.js';

class RedisStreamClient {
  constructor() {
    this.client = new Redis({
      host: config.redis?.host || 'localhost',
      port: config.redis?.port || 6379,
      password: config.redis?.password,
      retryStrategy: (times) => {
        const delay = Math.min(times * 50, 2000);
        return delay;
      }
    });

    this.client.on('connect', () => {
      logger.info('Redis Stream client connected');
    });

    this.client.on('error', (err) => {
      logger.error('Redis Stream client error:', err);
    });

    // Stream names
    this.streams = {
      TRANSACTIONS: 'bank:transactions',
      PROCESSING_RESULTS: 'bank:results',
      CATEGORIZATION: 'bank:categorization',
      RISK_ANALYSIS: 'bank:risk'
    };

    // Consumer groups
    this.consumerGroups = {
      PROCESSORS: 'processors',
      CATEGORIZERS: 'categorizers',
      ANALYZERS: 'analyzers'
    };
  }

  async createConsumerGroups() {
    for (const [streamKey, streamName] of Object.entries(this.streams)) {
      for (const [groupKey, groupName] of Object.entries(this.consumerGroups)) {
        try {
          await this.client.xgroup('CREATE', streamName, groupName, '$', 'MKSTREAM');
          logger.info(`Created consumer group ${groupName} for stream ${streamName}`);
        } catch (err) {
          if (err.message.includes('BUSYGROUP')) {
            logger.debug(`Consumer group ${groupName} already exists for ${streamName}`);
          } else {
            logger.error(`Error creating consumer group:`, err);
          }
        }
      }
    }
  }

  async addTransaction(transaction) {
    const streamData = [
      'transaction_id', transaction.id,
      'description', transaction.description,
      'amount', transaction.amount.toString(),
      'date', transaction.date,
      'category', transaction.category || 'uncategorized',
      'timestamp', Date.now().toString()
    ];

    const id = await this.client.xadd(this.streams.TRANSACTIONS, '*', ...streamData);
    logger.debug(`Added transaction to stream with ID: ${id}`);
    return id;
  }

  async processTransactionStream(consumerName, callback) {
    logger.info(`Starting transaction processor: ${consumerName}`);
    
    while (true) {
      try {
        const results = await this.client.xreadgroup(
          'GROUP',
          this.consumerGroups.PROCESSORS,
          consumerName,
          'BLOCK',
          1000,
          'COUNT',
          10,
          'STREAMS',
          this.streams.TRANSACTIONS,
          '>'
        );

        if (results && results.length > 0) {
          const [streamName, messages] = results[0];
          
          for (const [messageId, fields] of messages) {
            const transaction = this.parseStreamFields(fields);
            
            try {
              await callback(transaction, messageId);
              // Acknowledge successful processing
              await this.client.xack(
                this.streams.TRANSACTIONS,
                this.consumerGroups.PROCESSORS,
                messageId
              );
            } catch (error) {
              logger.error(`Error processing transaction ${messageId}:`, error);
              // Message will be redelivered to another consumer
            }
          }
        }
      } catch (error) {
        logger.error('Stream processing error:', error);
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
    }
  }

  parseStreamFields(fields) {
    const data = {};
    for (let i = 0; i < fields.length; i += 2) {
      data[fields[i]] = fields[i + 1];
    }
    return data;
  }

  async getStreamInfo(streamName) {
    const info = await this.client.xinfo('STREAM', streamName);
    return {
      length: info[1],
      firstEntry: info[7],
      lastEntry: info[9]
    };
  }

  async getPendingMessages(streamName, groupName) {
    return await this.client.xpending(streamName, groupName);
  }

  close() {
    return this.client.quit();
  }
}

class RedisStreamMock {
  constructor() {
    this.connected = false;
    logger.info('Using Redis Stream Mock (Redis disabled)');
  }

  async connect() {
    this.connected = true;
    return true;
  }

  async disconnect() {
    this.connected = false;
    return true;
  }

  async addMessage(stream, data) {
    logger.debug(`Mock: Adding message to stream ${stream}`);
    return '1234567890-0';
  }

  async readMessages(stream, group, consumer, count = 10) {
    return [];
  }

  async createConsumerGroup(stream, group) {
    return true;
  }

  async acknowledgeMessage(stream, group, id) {
    return true;
  }

  on(event, handler) {
    // Mock event handler
  }
}

// Export the appropriate instance based on configuration
export default config.redis?.enabled !== false 
  ? new RedisStreamClient() 
  : new RedisStreamMock();