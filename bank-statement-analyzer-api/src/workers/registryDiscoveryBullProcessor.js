/**
 * Registry discovery job processor — research + playbook proposal.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import StateRegistryProfile from '../models/StateRegistryProfile.js';
import logger from '../utils/logger.js';
import { researchStateRegistryPortal } from '../services/businessRegistry/ai/registryResearchAgent.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PLAYBOOKS_DIR = path.join(__dirname, '..', 'services', 'businessRegistry', 'playbooks');

/**
 * @param {import('bull').Job} job
 */
export async function processRegistryDiscoveryJob(job) {
  const { stateCode, businessName, jobId } = job.data || {};
  if (!stateCode) throw new Error('registry-discovery job missing stateCode');

  const code = String(stateCode).toUpperCase();
  logger.info(`[REGISTRY] Starting discovery for ${code}`, { jobId, businessName });

  const research = await researchStateRegistryPortal(code);
  const diskPlaybook = loadDiskPlaybook(code);

  let profile = await StateRegistryProfile.findOne({ stateCode: code });
  if (!profile) {
    profile = await StateRegistryProfile.create({
      stateCode: code,
      stateName: research.stateName || code,
      officialPortalUrl: research.officialPortalUrl || diskPlaybook?.entryUrl || '',
      portalSignupUrl: research.portalSignupUrl || research.officialPortalUrl || '',
      accessTier: research.accessTier || 'FREE_PUBLIC',
      status: 'PENDING',
      playbooks: []
    });
  }

  const mapping = diskPlaybook || research.proposedPlaybook;
  if (!mapping || Object.keys(mapping).length === 0) {
    throw new Error(`No playbook available for ${code}`);
  }

  const nextVersion =
    profile.playbooks.length > 0
      ? Math.max(...profile.playbooks.map((p) => p.version || 0)) + 1
      : 1;

  profile.playbooks.push({
    version: nextVersion,
    status: 'LEARNING',
    strategy: 'BROWSER_PLAYBOOK',
    mapping,
    consecutiveSuccesses: 0,
    canaryBusinessName: businessName || 'TEST COMPANY LLC'
  });

  if (research.officialPortalUrl) {
    profile.officialPortalUrl = research.officialPortalUrl;
  }
  profile.status = 'ACTIVE';
  await profile.save();

  logger.info(`[REGISTRY] Discovery complete for ${code} v${nextVersion}`);
  return { stateCode: code, version: nextVersion, status: 'LEARNING' };
}

function loadDiskPlaybook(stateCode) {
  const file = path.join(PLAYBOOKS_DIR, `${stateCode}.v1.json`);
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

export async function processRegistryDiscoveryJobSafe(job) {
  try {
    return await processRegistryDiscoveryJob(job);
  } catch (err) {
    logger.error(`[REGISTRY] Discovery processor error: ${err.message}`);
    throw err;
  }
}

export default { processRegistryDiscoveryJob, processRegistryDiscoveryJobSafe };
