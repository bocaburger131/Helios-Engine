/**
 * BullMQ queue for statement batch (parse + macro). API is producer-only.
 * @license Copyright (c) 2025 Shift 4 Financial INC
 */

import crypto from 'crypto';
import { Queue } from 'bullmq';
import { getBullMqConnection } from '../config/bullMqConnection.js';
import logger from '../utils/logger.js';

export const STATEMENT_PROCESSING_QUEUE = 'statement-processing';

let queueInstance = null;

export function getStatementProcessingQueue() {
  if (!queueInstance) {
    queueInstance = new Queue(STATEMENT_PROCESSING_QUEUE, {
      connection: getBullMqConnection(),
      defaultJobOptions: {
        attempts: 2,
        backoff: { type: 'exponential', delay: 3000 },
        removeOnComplete: 100,
        removeOnFail: 50
      }
    });
  }
  return queueInstance;
}

/**
 * @param {object} jobData
 * @param {string} jobData.jobId
 * @param {string} jobData.uploadSessionId
 */
export async function enqueueStatementBatchJob(jobData) {
  const jobId = String(jobData.jobId || crypto.randomUUID());
  const queue = getStatementProcessingQueue();
  const payload = { ...jobData, jobId };

  try {
    const job = await queue.add('parse-and-macro', payload, { jobId });
    logger.info('[STATEMENT_QUEUE] Enqueued batch job', {
      jobId: job.id,
      uploadSessionId: payload.uploadSessionId
    });
    return job;
  } catch (err) {
    const msg = String(err?.message || err);
    if (msg.includes('already exists')) {
      const retryId = `${jobId}-${Date.now()}`;
      return queue.add('parse-and-macro', { ...payload, jobId: retryId }, { jobId: retryId });
    }
    throw err;
  }
}

/**
 * @param {string} jobId
 */
export async function getStatementJobStatus(jobId) {
  const queue = getStatementProcessingQueue();
  const job = await queue.getJob(jobId);
  if (!job) return null;

  const state = await job.getState();
  const returnvalue = job.returnvalue ?? null;
  const correlationId = job.data?.correlationId || jobId;

  if (state === 'completed') {
    if (returnvalue?.status === 'requires_bank_confirmation') {
      return { jobId, status: 'requires_bank_confirmation', correlationId, ...returnvalue };
    }
    if (returnvalue?.status === 'failed') {
      return {
        jobId,
        status: 'failed',
        correlationId,
        error: returnvalue.error || returnvalue.message || 'Batch failed'
      };
    }
    if (returnvalue?.status === 'COMPLETED_WITH_WARNINGS') {
      return {
        jobId,
        status: 'COMPLETED_WITH_WARNINGS',
        correlationId,
        result: returnvalue.result,
        diagnosticSummaries: returnvalue.diagnosticSummaries || []
      };
    }
    if (returnvalue?.status === 'completed' && returnvalue.result) {
      return { jobId, status: 'completed', correlationId, result: returnvalue.result };
    }
    if (returnvalue?.data) {
      return { jobId, status: 'completed', correlationId, result: returnvalue };
    }
    return { jobId, status: 'completed', correlationId, result: returnvalue };
  }

  if (state === 'failed') {
    return {
      jobId,
      status: 'failed',
      correlationId,
      error: job.failedReason || 'Job failed'
    };
  }

  return { jobId, status: state === 'active' ? 'processing' : state, correlationId };
}

export async function isStatementQueueAvailable() {
  if (process.env.USE_REDIS === 'false') return false;
  try {
    const queue = getStatementProcessingQueue();
    const client = await queue.client;
    if (client && typeof client.ping === 'function') {
      const pong = await client.ping();
      return pong === 'PONG' || pong === 'pong';
    }
    return Boolean(client);
  } catch {
    return false;
  }
}

export default {
  STATEMENT_PROCESSING_QUEUE,
  getStatementProcessingQueue,
  enqueueStatementBatchJob,
  getStatementJobStatus,
  isStatementQueueAvailable
};
