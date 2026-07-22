/**
 * CLI entry for registry health cron.
 */
import '../config/env.js';
import mongoose from 'mongoose';
import { getMongoUri } from '../config/mongoUri.js';
import { runRegistryHealthCron } from '../services/businessRegistry/cron/registryHealthCron.js';
import logger from '../utils/logger.js';

async function main() {
  const uri = getMongoUri();
  if (uri) {
    await mongoose.connect(uri);
  }
  const results = await runRegistryHealthCron();
  logger.info('[REGISTRY_HEALTH] Results', { results });
  await mongoose.disconnect().catch(() => {});
  process.exit(0);
}

main().catch((err) => {
  logger.error(err);
  process.exit(1);
});
