/**
 * Queue for AI playbook repair after health-check failures.
 */

import Bull from 'bull';
import logger from '../../utils/logger.js';
import { processRegistryRepairJobSafe } from '../../workers/registryRepairBullProcessor.js';

const redisConfig = {
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: process.env.REDIS_PORT || 6379,
    password: process.env.REDIS_PASSWORD
  }
};

const registryRepairQueue = new Bull('registry-repair', redisConfig);

if (process.env.ENABLE_REGISTRY_REPAIR_WORKER === 'true') {
  registryRepairQueue.process(async (job) => processRegistryRepairJobSafe(job));
  registryRepairQueue.on('failed', (job, err) => {
    logger.error({ msg: '[REGISTRY] Repair job failed', jobId: job?.id, error: err?.message });
  });
}

export async function enqueueRegistryRepairJob(data) {
  try {
    return await registryRepairQueue.add(data, {
      removeOnComplete: 30,
      removeOnFail: 50,
      attempts: 1
    });
  } catch (err) {
    logger.warn(`[REGISTRY] enqueueRegistryRepairJob failed: ${err.message}`);
    return null;
  }
}

export { registryRepairQueue };
export default registryRepairQueue;
