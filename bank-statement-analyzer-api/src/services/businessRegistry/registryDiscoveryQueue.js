/**
 * Bull queue for AI-assisted registry playbook discovery.
 */

import Bull from 'bull';
import logger from '../../utils/logger.js';
import { processRegistryDiscoveryJobSafe } from '../../workers/registryDiscoveryBullProcessor.js';

const redisConfig = {
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: process.env.REDIS_PORT || 6379,
    password: process.env.REDIS_PASSWORD
  },
  limiter: {
    max: Number(process.env.REGISTRY_DISCOVERY_QUEUE_MAX_PER_MINUTE) || 5,
    duration: 60000
  }
};

const registryDiscoveryQueue = new Bull('registry-discovery', redisConfig);

if (process.env.ENABLE_REGISTRY_DISCOVERY_WORKER === 'true') {
  registryDiscoveryQueue.process(async (job) => processRegistryDiscoveryJobSafe(job));
  registryDiscoveryQueue.on('failed', (job, err) => {
    logger.error({
      msg: '[REGISTRY] Discovery job failed',
      jobId: job?.id,
      error: err?.message
    });
  });
}

/**
 * @param {{ stateCode: string, businessName?: string, jobId?: string }} data
 */
export async function enqueueRegistryDiscoveryJob(data, opts = {}) {
  if (!data?.stateCode) return null;
  try {
    return await registryDiscoveryQueue.add(data, {
      removeOnComplete: 50,
      removeOnFail: 100,
      attempts: 2,
      backoff: { type: 'exponential', delay: 5000 },
      ...opts
    });
  } catch (err) {
    logger.warn(`[REGISTRY] enqueueRegistryDiscoveryJob failed: ${err.message}`);
    return null;
  }
}

export { registryDiscoveryQueue };
export default registryDiscoveryQueue;
