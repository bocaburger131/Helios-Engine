/**
 * Playbook lifecycle: LEARNING → VERIFIED → FAILED / DEGRADED.
 * Mirrors templateGraduationService patterns.
 */

import StateRegistryProfile from '../../models/StateRegistryProfile.js';
import logger from '../../utils/logger.js';

const GRADUATION_THRESHOLD = Number(process.env.REGISTRY_GRADUATION_THRESHOLD) || 3;

/**
 * @param {Array<{ version?: number, status?: string }>} playbooks
 * @returns {object|null}
 */
export function getVerifiedPlaybook(playbooks) {
  const list = Array.isArray(playbooks) ? playbooks : [];
  const verified = list
    .filter((p) => String(p.status || '').toUpperCase() === 'VERIFIED')
    .sort((a, b) => (b.version || 0) - (a.version || 0));
  return verified[0] || null;
}

/**
 * @param {Array<{ version?: number, status?: string }>} playbooks
 * @returns {object|null}
 */
export function getLatestLearningPlaybook(playbooks) {
  const list = Array.isArray(playbooks) ? playbooks : [];
  const learning = list
    .filter((p) => {
      const s = String(p.status || '').toUpperCase();
      return s === 'LEARNING' || s === 'DEGRADED';
    })
    .sort((a, b) => (b.version || 0) - (a.version || 0));
  return learning[0] || null;
}

/**
 * @param {string} stateCode
 * @param {boolean} success
 * @param {number} playbookVersion
 * @param {string} [errorMessage]
 */
export async function recordPlaybookOutcome(stateCode, success, playbookVersion, errorMessage = '') {
  const profile = await StateRegistryProfile.findOne({ stateCode: stateCode.toUpperCase() });
  if (!profile) return null;

  const pb = profile.playbooks.find((p) => p.version === playbookVersion);
  if (!pb) return null;

  pb.totalProcessed = (pb.totalProcessed || 0) + 1;

  if (success) {
    pb.consecutiveSuccesses = (pb.consecutiveSuccesses || 0) + 1;
    pb.lastError = '';
    if (pb.consecutiveSuccesses >= GRADUATION_THRESHOLD && pb.status === 'LEARNING') {
      pb.status = 'VERIFIED';
      logger.info(`[REGISTRY] Playbook ${stateCode} v${playbookVersion} graduated to VERIFIED`);
    }
    if (pb.status === 'DEGRADED') {
      pb.status = 'LEARNING';
    }
  } else {
    pb.consecutiveSuccesses = 0;
    pb.lastError = errorMessage || 'verification failed';
    if (pb.status === 'VERIFIED') {
      pb.status = 'DEGRADED';
      logger.warn(`[REGISTRY] Playbook ${stateCode} v${playbookVersion} degraded after failure`);
    }
  }

  await profile.save();
  return pb;
}

/**
 * @param {string} stateCode
 */
export async function markHealthCheckPassed(stateCode, playbookVersion) {
  const profile = await StateRegistryProfile.findOne({ stateCode: stateCode.toUpperCase() });
  if (!profile) return;
  const pb = profile.playbooks.find((p) => p.version === playbookVersion);
  if (!pb) return;
  pb.lastHealthCheckAt = new Date();
  await profile.save();
}

export default {
  getVerifiedPlaybook,
  getLatestLearningPlaybook,
  recordPlaybookOutcome,
  markHealthCheckPassed,
  GRADUATION_THRESHOLD
};
