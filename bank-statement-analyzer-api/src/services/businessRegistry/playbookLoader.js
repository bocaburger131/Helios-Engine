/**
 * Load playbook JSON from disk or StateRegistryProfile mapping.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PLAYBOOKS_DIR = path.join(__dirname, 'playbooks');

/**
 * @param {string} stateCode
 * @param {number} [version]
 * @returns {object|null}
 */
export function loadPlaybookFromDisk(stateCode, version = 1) {
  const file = path.join(PLAYBOOKS_DIR, `${stateCode.toUpperCase()}.v${version}.json`);
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

/**
 * @param {object} profilePlaybook - Mongo subdoc with mapping
 * @param {string} stateCode
 */
export function resolvePlaybookMapping(profilePlaybook, stateCode) {
  if (profilePlaybook?.mapping && Object.keys(profilePlaybook.mapping).length > 0) {
    return {
      ...profilePlaybook.mapping,
      version: profilePlaybook.version,
      id: stateCode
    };
  }
  return loadPlaybookFromDisk(stateCode, profilePlaybook?.version || 1);
}

export default { loadPlaybookFromDisk, resolvePlaybookMapping };
