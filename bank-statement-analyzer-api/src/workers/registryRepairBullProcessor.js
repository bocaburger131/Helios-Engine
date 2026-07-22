/**
 * AI-assisted playbook repair after selector / DOM failures.
 */

import StateRegistryProfile from '../models/StateRegistryProfile.js';
import logger from '../utils/logger.js';
import { loadPlaybookFromDisk } from '../services/businessRegistry/playbookLoader.js';
import { proposePlaybookPatch } from '../services/businessRegistry/ai/registryRepairAgent.js';

/**
 * @param {import('bull').Job} job
 */
export async function processRegistryRepairJob(job) {
  const { stateCode, playbookVersion, error } = job.data || {};
  if (!stateCode) throw new Error('registry-repair missing stateCode');

  const code = String(stateCode).toUpperCase();
  const profile = await StateRegistryProfile.findOne({ stateCode: code });
  if (!profile) throw new Error(`No profile for ${code}`);

  const current = profile.playbooks.find((p) => p.version === playbookVersion);
  const baseMapping =
    current?.mapping && Object.keys(current.mapping).length > 0
      ? current.mapping
      : loadPlaybookFromDisk(code, playbookVersion || 1);

  const patched = await proposePlaybookPatch({
    stateCode: code,
    currentPlaybook: baseMapping,
    error: error || 'unknown'
  });

  const nextVersion =
    profile.playbooks.length > 0
      ? Math.max(...profile.playbooks.map((p) => p.version || 0)) + 1
      : 1;

  profile.playbooks.push({
    version: nextVersion,
    status: 'LEARNING',
    strategy: 'BROWSER_PLAYBOOK',
    mapping: patched,
    consecutiveSuccesses: 0,
    lastError: error || ''
  });

  await profile.save();
  logger.info(`[REGISTRY] Repair created ${code} v${nextVersion}`);
  return { stateCode: code, version: nextVersion };
}

export async function processRegistryRepairJobSafe(job) {
  try {
    return await processRegistryRepairJob(job);
  } catch (err) {
    logger.error(`[REGISTRY] Repair processor error: ${err.message}`);
    throw err;
  }
}

export default { processRegistryRepairJob, processRegistryRepairJobSafe };
