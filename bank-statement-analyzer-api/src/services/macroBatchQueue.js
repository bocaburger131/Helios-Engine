/**
 * @deprecated Use statementProcessingQueue.js (BullMQ) for macro batch jobs.
 * Batch upload no longer uses this Bull queue; kept only for legacy imports.
 * @license Copyright (c) 2025 Shift 4 Financial INC
 */

import Bull from 'bull';

if (!globalThis.__macroBatchQueueDeprecatedWarned) {
  globalThis.__macroBatchQueueDeprecatedWarned = true;
  console.warn(
    '[MACRO] macroBatchQueue.js is deprecated — use statementProcessingQueue.js and npm run workers:statement-processing'
  );
}
import logger from '../utils/logger.js';
import {
  readMacroBatchJob,
  completeMacroBatchJob,
  failMacroBatchJob,
  writeMacroBatchJob
} from './macroBatchJobStore.js';

const redisConfig = {
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: Number(process.env.REDIS_PORT || 6380),
    password: process.env.REDIS_PASSWORD
  },
  limiter: {
    max: Number(process.env.MACRO_BATCH_QUEUE_MAX_PER_MINUTE) || 6,
    duration: 60000
  }
};

const macroBatchQueue = new Bull('macro-batch', redisConfig);

/** @type {((jobId: string) => Promise<object>)|null} */
let processorFn = null;

export function registerMacroBatchProcessor(fn) {
  processorFn = fn;
  if (process.env.ENABLE_MACRO_BATCH_WORKER === 'true') {
    macroBatchQueue.process(async (job) => {
      if (!processorFn) {
        throw new Error('Macro batch processor not registered');
      }
      const jobId = job.data?.jobId || String(job.id);
      writeMacroBatchJob(jobId, { status: 'processing', bullJobId: job.id });
      try {
        const envelope = await processorFn(jobId);
        await completeMacroBatchJob(jobId, envelope);
        return envelope;
      } catch (err) {
        await failMacroBatchJob(jobId, err);
        throw err;
      }
    });
    macroBatchQueue.on('failed', (job, err) => {
      logger.error({
        msg: '[MACRO] Bull macro-batch job failed',
        jobId: job?.id,
        error: err?.message
      });
    });
    logger.info('[MACRO] Bull processor registered for macro-batch queue');
  }
}

/**
 * @param {{ jobId: string, correlationId?: string, uploadSessionId?: string|null }} data
 */
export async function enqueueMacroBatchJob(data) {
  const jobId = data.jobId;
  writeMacroBatchJob(jobId, {
    status: 'queued',
    correlationId: data.correlationId || jobId,
    uploadSessionId: data.uploadSessionId || null,
    queuedAt: Date.now()
  });

  try {
    return await macroBatchQueue.add(data, {
      jobId: `macro-${jobId}`,
      attempts: 1,
      removeOnComplete: 50,
      removeOnFail: 25
    });
  } catch (err) {
    const msg = String(err?.message || err);
    if (msg.includes('job id already exists') || msg.includes('Job already exists')) {
      return macroBatchQueue.add(data, {
        jobId: `macro-${jobId}-${Date.now()}`,
        attempts: 1,
        removeOnComplete: 50,
        removeOnFail: 25
      });
    }
    throw err;
  }
}

export async function getMacroBatchJobStatus(jobId) {
  const fileStatus = readMacroBatchJob(jobId);
  if (fileStatus) return fileStatus;

  const job = await macroBatchQueue.getJob(`macro-${jobId}`);
  if (!job) return null;

  const state = await job.getState();
  return {
    jobId,
    status: state,
    progress: job.progress(),
    result: job.returnvalue || null,
    failedReason: job.failedReason || null
  };
}

export { macroBatchQueue };
export default macroBatchQueue;
