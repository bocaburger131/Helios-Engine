/**
 * BullMQ worker: parse + macro batch pipeline (isolated from Express API).
 * Run: npm run workers:statement-processing
 * @license Copyright (c) 2025 Shift 4 Financial INC
 */

import '../config/env.js';
import mongoose from 'mongoose';
import { Worker } from 'bullmq';
import { getBullMqConnection } from '../config/bullMqConnection.js';
import { getMongoUri, getMongoUriSource, sanitizeMongoUri } from '../config/mongoUri.js';
import { STATEMENT_PROCESSING_QUEUE } from '../services/statementProcessingQueue.js';
import { runStatementBatchJob } from '../services/statementBatchPipelineService.js';
import { clearBatchProgress } from '../services/batchProgressStore.js';
import logger from '../utils/logger.js';

const uri = getMongoUri();
if (!uri) {
  logger.error('[STATEMENT_WORKER] MongoDB URI not set — set MONGO_URI or MONGODB_URI');
  process.exit(1);
}

try {
  const source = getMongoUriSource();
  logger.info(
    `[STATEMENT_WORKER] Connecting to MongoDB via ${source}: ${sanitizeMongoUri(uri)}`
  );
  await mongoose.connect(uri, {
    serverSelectionTimeoutMS: 10000,
    socketTimeoutMS: 45000
  });
  logger.info('[STATEMENT_WORKER] MongoDB connected');
} catch (err) {
  logger.error('[STATEMENT_WORKER] MongoDB connection failed', { error: err?.message });
  process.exit(1);
}

await import('../models/Statement.js');
await import('../models/InstitutionalProfile.js');

const concurrency = Number(process.env.STATEMENT_PROCESSING_CONCURRENCY) || 2;

const worker = new Worker(
  STATEMENT_PROCESSING_QUEUE,
  async (job) => {
    const correlationId = job.data?.correlationId || job.data?.jobId || String(job.id);
    logger.info('[STATEMENT_WORKER] Job started', {
      jobId: job.id,
      uploadSessionId: job.data?.uploadSessionId
    });
    try {
      const outcome = await runStatementBatchJob(job.data);
      return outcome;
    } finally {
      await clearBatchProgress(correlationId);
    }
  },
  {
    connection: getBullMqConnection(),
    concurrency,
    lockDuration: 300_000,
    lockRenewTime: 120_000
  }
);

worker.on('completed', (job, returnvalue) => {
  logger.info('[STATEMENT_WORKER] Job completed', {
    jobId: job?.id,
    status: returnvalue?.status
  });
});

worker.on('failed', (job, err) => {
  logger.error('[STATEMENT_WORKER] Job failed', {
    jobId: job?.id,
    error: err?.message
  });
});

worker.on('stalled', (jobId) => {
  logger.warn('[STATEMENT_WORKER] Job stalled — may be double-processed on recovery', {
    jobId
  });
});

worker.on('error', (err) => {
  logger.error('[STATEMENT_WORKER] Worker error', { error: err?.message });
});

logger.info(
  `[STATEMENT_WORKER] Listening on "${STATEMENT_PROCESSING_QUEUE}" (concurrency=${concurrency})`
);

async function shutdown(signal) {
  logger.info(`[STATEMENT_WORKER] Received ${signal}, shutting down…`);
  try {
    await worker.close();
    await mongoose.disconnect();
    logger.info('[STATEMENT_WORKER] Shutdown complete');
    process.exit(0);
  } catch (err) {
    logger.error('[STATEMENT_WORKER] Shutdown error', { error: err?.message });
    process.exit(1);
  }
}

process.on('SIGTERM', () => {
  void shutdown('SIGTERM');
});
process.on('SIGINT', () => {
  void shutdown('SIGINT');
});
