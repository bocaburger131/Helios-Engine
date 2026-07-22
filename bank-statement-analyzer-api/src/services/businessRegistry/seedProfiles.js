/**
 * Seed StateRegistryProfile documents from bundled playbooks.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import StateRegistryProfile from '../../models/StateRegistryProfile.js';
import logger from '../../utils/logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PLAYBOOKS_DIR = path.join(__dirname, 'playbooks');

const DEFAULT_PROFILES = [
  {
    stateCode: 'CA',
    stateName: 'California',
    officialPortalUrl: 'https://bizfileonline.sos.ca.gov/search/business',
    portalSignupUrl: 'https://bizfileonline.sos.ca.gov/',
    accessTier: 'FREE_PUBLIC'
  },
  {
    stateCode: 'OH',
    stateName: 'Ohio',
    officialPortalUrl: 'https://businesssearch.ohiosos.gov/',
    portalSignupUrl: 'https://businesssearch.ohiosos.gov/',
    accessTier: 'FREE_PUBLIC'
  }
];

/**
 * @param {string} stateCode
 * @param {number} version
 */
function loadPlaybookMapping(stateCode, version) {
  const file = path.join(PLAYBOOKS_DIR, `${stateCode}.v${version}.json`);
  if (!fs.existsSync(file)) return {};
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

export async function seedStateRegistryProfiles() {
  for (const def of DEFAULT_PROFILES) {
    const mapping = loadPlaybookMapping(def.stateCode, 1);
    const existing = await StateRegistryProfile.findOne({ stateCode: def.stateCode });
    if (existing) {
      const verifiedIdx = (existing.playbooks || []).findIndex(
        (p) => p.status === 'VERIFIED' && p.version === 1
      );
      if (verifiedIdx >= 0 && mapping && Object.keys(mapping).length > 0) {
        existing.playbooks[verifiedIdx].mapping = mapping;
        await existing.save();
        logger.info(`[REGISTRY] Refreshed playbook mapping for ${def.stateCode} v1`);
        continue;
      }
      const hasVerified = verifiedIdx >= 0;
      if (!hasVerified && mapping && Object.keys(mapping).length > 0) {
        existing.playbooks.push({
          version: 1,
          status: 'VERIFIED',
          strategy: 'BROWSER_PLAYBOOK',
          mapping,
          consecutiveSuccesses: 3
        });
        await existing.save();
        logger.info(`[REGISTRY] Added playbook to existing profile ${def.stateCode}`);
      }
      continue;
    }

    await StateRegistryProfile.create({
      ...def,
      status: 'ACTIVE',
      playbooks: [
        {
          version: 1,
          status: 'VERIFIED',
          strategy: 'BROWSER_PLAYBOOK',
          mapping,
          consecutiveSuccesses: 3,
          canaryBusinessName: 'TEST COMPANY LLC'
        }
      ]
    });
    logger.info(`[REGISTRY] Seeded profile for ${def.stateCode}`);
  }
}

export default { seedStateRegistryProfiles };
