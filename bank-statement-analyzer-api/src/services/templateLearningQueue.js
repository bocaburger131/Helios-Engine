/**
 * Isolated Bull queue for template-learning jobs (avoids duplicate processors on main queueService).
 * @license Copyright (c) 2025 Shift 4 Financial INC
 */

import Bull from 'bull';
import logger from '../utils/logger.js';
import { processTemplateLearningJobSafe } from '../workers/templateLearningBullProcessor.js';

const redisConfig = {
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: process.env.REDIS_PORT || 6379,
    password: process.env.REDIS_PASSWORD
  },
  limiter: {
    max: Number(process.env.TEMPLATE_LEARNING_QUEUE_MAX_PER_MINUTE) || 10,
    duration: 60000
  }
};

const templateLearningQueue = new Bull('template-learning', redisConfig);

if (process.env.ENABLE_TEMPLATE_LEARNING_WORKER === 'true') {
  templateLearningQueue.process(async (job) => processTemplateLearningJobSafe(job));
  templateLearningQueue.on('failed', (job, err) => {
    logger.error({
      msg: '[LEARNING] Bull job failed',
      service: 'bank-statement-analyzer',
      jobId: job?.id,
      error: err?.message
    });
  });
  logger.info({
    msg: '[LEARNING] Bull processor registered for template-learning queue',
    service: 'bank-statement-analyzer',
    timestamp: new Date().toISOString()
  });
}

/**
 * @param {object} data
 * @param {string} data.filePath
 * @param {string} data.rtn
 * @param {string} data.institutionalProfileId
 * @param {string} data.statementId
 * @param {object} [data.anchorData]
 * @param {string} [data.fileHash]
 */
export async function enqueueTemplateLearningJob(data, opts = {}) {
  const profileKey = String(data.institutionalProfileId || 'na');
  const hash = String(data.fileHash || 'na').slice(0, 32);
  const baseJobId = opts.jobId || `tl-${profileKey}-${hash}`;

  const addOpts = {
    attempts: 2,
    backoff: { type: 'exponential', delay: 8000 },
    removeOnComplete: 100,
    removeOnFail: 50,
    jobId: baseJobId
  };

  try {
    return await templateLearningQueue.add(data, addOpts);
  } catch (err) {
    const msg = String(err?.message || err);
    if (msg.includes('job id already exists') || msg.includes('Job already exists')) {
      return templateLearningQueue.add(data, {
        ...addOpts,
        jobId: `${baseJobId}-${Date.now()}`
      });
    }
    throw err;
  }
}

export async function getTemplateLearningJobStatus(jobId) {
  const job = await templateLearningQueue.getJob(jobId);
  if (!job) return null;
  return {
    id: job.id,
    status: await job.getState(),
    progress: job.progress(),
    data: job.data,
    result: job.returnvalue,
    failedReason: job.failedReason
  };
}

export { templateLearningQueue };
export default templateLearningQueue;
