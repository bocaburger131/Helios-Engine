/**
 * Simplified Redis Stream Service
 * 
 * This service provides a streamlined approach to job processing using Redis Streams.
 * It uses a single stream and consumer group for all analysis jobs.
 */

import redis from '../config/redis.js';
import logger from '../utils/logger.js';
import Statement from '../models/Statement.js';
import businessRegistryOrchestrator from './businessRegistry/orchestrator.js';

const STREAM_KEY = 'analysis-jobs';
const CONSUMER_GROUP = 'analysis-workers';
const CONSUMER_NAME = `worker-${process.pid}`;

class RedisStreamService {
  constructor() {
    this.statementController = null;
    this.statementControllerPromise = null;
    this.isProcessing = false;
    this.streamsSupported = true;
    this.streams = {
      STATEMENT_PROCESSING: STREAM_KEY,
      TRANSACTION_CATEGORIZATION: 'transaction-categorization-jobs',
      ERROR: 'error-jobs'
    };
    this.initialize().catch(err => {
      logger.error('Failed to initialize Redis Stream Service:', err);
    });
  }

  async getStatementController() {
    if (this.statementController) {
      return this.statementController;
    }

    if (!this.statementControllerPromise) {
      this.statementControllerPromise = import('../controllers/statementController.js').then(
        (module) => module.default
      );
    }

    this.statementController = await this.statementControllerPromise;
    return this.statementController;
  }

  async addToStream(streamName = STREAM_KEY, payload = {}) {
    try {
      const enrichedPayload = {
        ...payload,
        timestamp: Date.now()
      };

      const messageId = await redis.xadd(
        streamName,
        '*',
        'data',
        JSON.stringify(enrichedPayload)
      );

      logger.info('Message added to stream', {
        streamName,
        messageId
      });

      return messageId;
    } catch (error) {
      logger.error('Failed to add message to stream:', error);
      throw error;
    }
  }

  async initialize() {
    try {
      await redis.xgroup('CREATE', STREAM_KEY, CONSUMER_GROUP, '0', 'MKSTREAM');
      logger.info('Redis stream ready', {
        stream: STREAM_KEY,
        group: CONSUMER_GROUP
      });
    } catch (error) {
      // BUSYGROUP means group already exists, which is fine
      if (error.message.includes('unknown command')) {
        this.streamsSupported = false;
        let redisVersion = 'unknown';
        try {
          const info = await redis.info('server');
          const match = info.match(/redis_version:(\S+)/i);
          if (match) redisVersion = match[1];
        } catch {
          /* ignore */
        }
        logger.warn(
          'Redis instance does not support stream commands (XGROUP/XADD). Background stream worker disabled.',
          {
            redisVersion,
            hint:
              'Use Redis 5.0+ (e.g. docker run -p 6380:6379 redis:7-alpine). Upload/analysis via HTTP still works synchronously.'
          }
        );
        logger.debug('Redis stream initialization error:', error);
        return;
      }

      if (!error.message.includes('BUSYGROUP')) {
        throw error;
      }
    }
  }

  async addJob(jobData) {
    try {
      // Add metadata to job
      const enrichedJobData = {
        ...jobData,
        timestamp: Date.now(),
        status: 'pending'
      };

      const jobId = await redis.xadd(
        STREAM_KEY,
        '*',  // Auto-generate ID
        'data', 
        JSON.stringify(enrichedJobData)
      );

      logger.info('Job added to stream', { 
        jobId,
        type: jobData.type
      });

      return jobId;
    } catch (error) {
      logger.error('Failed to add job to stream:', error);
      throw error;
    }
  }

  async processJobs() {
    if (this.isProcessing) {
      logger.warn('Worker already processing jobs');
      return;
    }

    if (!this.streamsSupported) {
      logger.info('Redis streams unsupported; skipping job processing');
      return;
    }

    const statementController = await this.getStatementController();

    this.isProcessing = true;
    logger.info(`Worker ${CONSUMER_NAME} started processing jobs`);

    while (this.isProcessing) {
      try {
        const result = await redis.xreadgroup(
          'GROUP', CONSUMER_GROUP, CONSUMER_NAME,
          'COUNT', 1,
          'BLOCK', 5000,
          'STREAMS', STREAM_KEY, '>'
        );

        if (result && result.length) {
          logger.info(`Received ${result[0]?.[1]?.length || 0} message(s) from Redis stream.`);
        }

        if (!result || !result.length) {
          continue;
        }

        const [, messages] = result[0];
        const [messageId, [, rawJob]] = messages[0];
        const job = JSON.parse(rawJob);

        logger.info(`Processing job with ID: ${messageId}`);

        try {
          if (job.type === 'statement_analysis') {
            // Handle Zoho integration jobs
            if (job.payload.statements) {
              for (const stmt of job.payload.statements) {
                await statementController.uploadStatements(
                  stmt.statementId,
                  stmt.filePath, // Pass the file path from the job
                  null  // userId will be null for Zoho files
                );
              }
            } else {
              // Handle regular upload jobs
              await statementController.uploadStatements(
                job.payload.statementId,
                job.payload.filePath,
                job.payload.userId
              );
            }
          } else if (job.type === 'PROCESS_MACRO_BATCH') {
            logger.info(`⚙️ [WORKER] Processing Macro Batch for Statement ID: ${job.payload.statementId}`);
            
            try {
              // 1. Fetch the macro statement from the database
              const statement = await Statement.findById(job.payload.statementId);
              if (!statement) {
                throw new Error(`Statement ${job.payload.statementId} not found in database.`);
              }

              // 2. Set status to indicate the background worker has picked it up
              statement.status = 'EVALUATING_JR_UW';
              await statement.save();

              // 3. Evaluate for Junior Underwriting (SOS, Credit, Address)
              const veritasScore = statement.summary?.veritasScore || 0;
              const criticalAlerts = statement.summary?.alertSummary?.critical || 0;

              if (veritasScore >= 600 && criticalAlerts === 0) {
                logger.info(`[WORKER] Score ${veritasScore} meets criteria. Queuing Junior Underwriting...`);

                if (process.env.USE_SOS_VERIFICATION === 'true') {
                  const ctx = statement.applicationContext || {};
                  const sosData = await businessRegistryOrchestrator.verify({
                    businessName: ctx.companyName,
                    registrationState: ctx.registrationState,
                    businessAddress: ctx.businessAddress,
                    jobId: `worker-${job.payload.statementId}`,
                    userId: statement.user ? String(statement.user) : null
                  });
                  await Statement.findByIdAndUpdate(job.payload.statementId, {
                    $set: {
                      'analysis.metadata.sosVerification': sosData,
                      ...(sosData.alertCode === 'SOS_CREDENTIALS_REQUIRED'
                        ? {
                            'veraVerification.registryCredentialRequest': {
                              stateCode: sosData.state,
                              portalSignupUrl: sosData.portalSignupUrl || null,
                              message:
                                'This state registry requires portal credentials. Use Vera to add credits or create an account, then retry verification.',
                              requestedAt: new Date().toISOString()
                            }
                          }
                        : {})
                    }
                  });
                  logger.info(`[WORKER] Registry verification for ${ctx.registrationState || 'unknown'}: found=${sosData.found}`);
                }
              } else {
                logger.info(`[WORKER] Score ${veritasScore} or Critical Alerts (${criticalAlerts}) failed criteria. Halting.`);
              }

              // 4. Finalize
              statement.status = 'COMPLETED';
              await statement.save();
              
              logger.info(`✅ [WORKER] Macro Batch ${job.payload.statementId} background processing complete.`);
            } catch (err) {
              logger.error(`❌ [WORKER] Macro Batch failed: ${err.message}`);
              if (job.payload?.statementId) {
                await Statement.findByIdAndUpdate(job.payload.statementId, { status: 'FAILED' });
              }
            }
          } else {
            logger.warn(`Unknown job type: ${job.type}`);
          }

          await redis.xack(STREAM_KEY, CONSUMER_GROUP, messageId);
          logger.info(`Job ${messageId} processed and acknowledged.`);

        } catch (error) {
          logger.error('Job processing failed', {
            messageId,
            error: error.message,
          });
          // Optionally, move to a dead-letter queue
        }
      } catch (error) {
        if (error.message && error.message.includes('unknown command')) {
          this.streamsSupported = false;
          logger.error('Redis streams unsupported; stopping worker loop');
          this.isProcessing = false;
          return;
        }

        logger.error('Stream processing error:', error);
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
    }
  }

  async moveToErrorStream(messageId, job, error) {
    try {
      await redis.xadd(
        'error-jobs',
        '*',
        'data',
        JSON.stringify({
          ...job,
          error: error.message,
          failedAt: Date.now()
        })
      );
      
      // Acknowledge the failed job to remove it from pending
      await redis.xack(STREAM_KEY, CONSUMER_GROUP, messageId);
    } catch (err) {
      logger.error('Failed to move job to error stream:', err);
    }
  }

  async stop() {
    this.isProcessing = false;
    logger.info('Redis Stream processing stopped.');
  }
}
const redisStreamService = new RedisStreamService();
export default redisStreamService;

// Start processing if not in test environment and streams are supported
if (process.env.NODE_ENV !== 'test') {
  // Wait for initialization to complete before starting processing
  setTimeout(async () => {
    if (redisStreamService.streamsSupported) {
      try {
        await redisStreamService.processJobs();
      } catch (err) {
        logger.error('Failed to start job processing:', err);
      }
    } else {
      logger.info('Redis streams not supported; skipping job processing');
    }
  }, 1000); // Wait 1 second for initialization
}