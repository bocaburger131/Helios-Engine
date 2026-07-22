/**
 * Perplexity / heuristics research for state registry portals.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import logger from '../../../utils/logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PLAYBOOKS_DIR = path.join(__dirname, '..', 'playbooks');

const KNOWN_PORTALS = {
  CA: {
    stateName: 'California',
    officialPortalUrl: 'https://bizfileonline.sos.ca.gov/search/business',
    accessTier: 'FREE_PUBLIC'
  },
  OH: {
    stateName: 'Ohio',
    officialPortalUrl: 'https://businesssearch.ohiosos.gov/',
    accessTier: 'FREE_PUBLIC'
  },
  AK: {
    stateName: 'Alaska',
    officialPortalUrl: 'https://www.commerce.alaska.gov/cbp/main/search/entities',
    accessTier: 'FREE_PUBLIC'
  }
};

/**
 * @param {string} stateCode
 * @returns {Promise<{ stateName: string, officialPortalUrl: string, portalSignupUrl: string, accessTier: string, proposedPlaybook: object|null }>}
 */
export async function researchStateRegistryPortal(stateCode) {
  const code = String(stateCode || '').toUpperCase();
  const known = KNOWN_PORTALS[code];

  const diskFile = path.join(PLAYBOOKS_DIR, `${code}.v1.json`);
  let proposedPlaybook = null;
  if (fs.existsSync(diskFile)) {
    try {
      proposedPlaybook = JSON.parse(fs.readFileSync(diskFile, 'utf8'));
    } catch {
      proposedPlaybook = null;
    }
  }

  if (known) {
    return {
      stateName: known.stateName,
      officialPortalUrl: known.officialPortalUrl,
      portalSignupUrl: known.officialPortalUrl,
      accessTier: known.accessTier,
      proposedPlaybook
    };
  }

  if (process.env.PERPLEXITY_API_KEY && !/^your[-_]/i.test(process.env.PERPLEXITY_API_KEY)) {
    try {
      const { PerplexityService } = await import('../../perplexityService.js');
      const svc = new PerplexityService();
      const prompt = `What is the official ${code} Secretary of State business entity search URL? Is it free public access or paywalled? Reply JSON: {"officialPortalUrl":"","accessTier":"FREE_PUBLIC|PAYWALL|LOGIN_REQUIRED","stateName":""}`;
      const response = await svc.analyzeText(prompt);
      const text = typeof response === 'string' ? response : response?.content || response?.text || '';
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          stateName: parsed.stateName || code,
          officialPortalUrl: parsed.officialPortalUrl || '',
          portalSignupUrl: parsed.officialPortalUrl || '',
          accessTier: parsed.accessTier || 'MANUAL',
          proposedPlaybook
        };
      }
    } catch (err) {
      logger.warn(`[REGISTRY] Perplexity research failed for ${code}: ${err.message}`);
    }
  }

  return {
    stateName: code,
    officialPortalUrl: '',
    portalSignupUrl: '',
    accessTier: 'MANUAL',
    proposedPlaybook
  };
}

export default { researchStateRegistryPortal };
