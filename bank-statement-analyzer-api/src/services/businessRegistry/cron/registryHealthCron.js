/**
 * Nightly health checks for VERIFIED registry playbooks.
 */

import StateRegistryProfile from '../../../models/StateRegistryProfile.js';
import logger from '../../../utils/logger.js';
import businessRegistryOrchestrator from '../orchestrator.js';
import { getVerifiedPlaybook, markHealthCheckPassed, recordPlaybookOutcome } from '../registryGraduationService.js';
import { enqueueRegistryRepairJob } from '../registryRepairQueue.js';

const CANARY_NAME = process.env.REGISTRY_CANARY_BUSINESS || 'TEST COMPANY LLC';

/**
 * Run health check for all VERIFIED state playbooks.
 */
export async function runRegistryHealthCron() {
  const profiles = await StateRegistryProfile.find({ status: 'ACTIVE' });
  const results = [];

  for (const profile of profiles) {
    const pb = getVerifiedPlaybook(profile.playbooks);
    if (!pb) continue;

    const canaryName = pb.canaryBusinessName || CANARY_NAME;
    logger.info(`[REGISTRY_HEALTH] Canary ${profile.stateCode} v${pb.version}`);

    try {
      const outcome = await businessRegistryOrchestrator.verify({
        businessName: canaryName,
        registrationState: profile.stateCode
      });

      const ok = !outcome.error && (outcome.found || outcome.skipped);
      if (ok) {
        await markHealthCheckPassed(profile.stateCode, pb.version);
        results.push({ stateCode: profile.stateCode, ok: true });
      } else {
        await recordPlaybookOutcome(
          profile.stateCode,
          false,
          pb.version,
          outcome.reason || 'health check failed'
        );
        await enqueueRegistryRepairJob({
          stateCode: profile.stateCode,
          playbookVersion: pb.version,
          error: outcome.reason
        });
        results.push({ stateCode: profile.stateCode, ok: false });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await recordPlaybookOutcome(profile.stateCode, false, pb.version, msg);
      await enqueueRegistryRepairJob({
        stateCode: profile.stateCode,
        playbookVersion: pb.version,
        error: msg
      });
      results.push({ stateCode: profile.stateCode, ok: false, error: msg });
    }
  }

  await businessRegistryOrchestrator.closeRegistryBrowser().catch(() => {});
  logger.info('[REGISTRY_HEALTH] Complete', { checked: results.length });
  return results;
}

export default { runRegistryHealthCron };
