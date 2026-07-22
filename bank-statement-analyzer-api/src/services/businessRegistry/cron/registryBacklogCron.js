/**
 * Weekly backlog: enqueue discovery for states seen in deals without VERIFIED playbooks.
 */

import StateRegistryProfile from '../../../models/StateRegistryProfile.js';
import Statement from '../../../models/Statement.js';
import logger from '../../../utils/logger.js';
import { getVerifiedPlaybook } from '../registryGraduationService.js';
import { enqueueRegistryDiscoveryJob } from '../registryDiscoveryQueue.js';
import { resolveStateCode, parseStateFromAddress } from '../stateResolver.js';

/**
 * Scan recent statements for registration states lacking verified playbooks.
 */
export async function runRegistryBacklogCron() {
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const statements = await Statement.find({
    updatedAt: { $gte: since }
  })
    .select('applicationContext analysis.metadata.sosVerification')
    .limit(500)
    .lean();

  const stateCounts = new Map();

  for (const stmt of statements) {
    const ctx = stmt.applicationContext || {};
    const meta = stmt.analysis?.metadata?.sosVerification || {};
    const code =
      resolveStateCode(ctx.registrationState || meta.state) ||
      parseStateFromAddress(ctx.businessAddress);
    if (!code) continue;
    stateCounts.set(code, (stateCounts.get(code) || 0) + 1);
  }

  const enqueued = [];
  for (const [stateCode, count] of stateCounts.entries()) {
    const profile = await StateRegistryProfile.findOne({ stateCode });
    if (profile && getVerifiedPlaybook(profile.playbooks)) continue;

    await enqueueRegistryDiscoveryJob({ stateCode, trigger: 'backlog', dealCount: count });
    enqueued.push(stateCode);
    logger.info(`[REGISTRY_BACKLOG] Enqueued discovery for ${stateCode} (${count} deals)`);
  }

  return { enqueued, scanned: statements.length };
}

export default { runRegistryBacklogCron };
