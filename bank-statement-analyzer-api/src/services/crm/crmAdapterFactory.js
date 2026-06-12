/**
 * CRM adapter factory — routes by ACTIVE_CRM env without changing orchestrator code.
 * @license Copyright (c) 2025 Shift 4 Financial INC
 */

import { ZohoAdapter } from './zohoAdapter.js';
import { SalesforceAdapter } from './salesforceAdapter.js';
import logger from '../../utils/logger.js';

let cachedAdapter = null;
let cachedKey = null;

/**
 * @returns {boolean}
 */
export function isCrmIntegrationEnabled() {
  return String(process.env.ENABLE_CRM_INTEGRATION || 'false').toLowerCase() === 'true';
}

/**
 * @returns {string}
 */
export function getActiveCrmProvider() {
  return String(process.env.ACTIVE_CRM || 'zoho').toLowerCase().trim();
}

/**
 * @param {object} [config]
 * @returns {import('./zohoAdapter.js').ZohoAdapter | import('./salesforceAdapter.js').SalesforceAdapter}
 */
export function getCrmAdapter(config = {}) {
  const provider = getActiveCrmProvider();
  const cacheToken = `${provider}:${JSON.stringify(Object.keys(config))}`;

  if (cachedAdapter && cachedKey === cacheToken && !config.forceNew) {
    return cachedAdapter;
  }

  let adapter;
  switch (provider) {
    case 'salesforce':
      adapter = new SalesforceAdapter(config);
      break;
    case 'zoho':
    default:
      if (provider !== 'zoho') {
        logger.warn(`[CRM_FACTORY] Unknown ACTIVE_CRM="${provider}", falling back to zoho`);
      }
      adapter = new ZohoAdapter(config);
      break;
  }

  cachedAdapter = adapter;
  cachedKey = cacheToken;
  return adapter;
}

/** Reset singleton (tests). */
export function resetCrmAdapterCache() {
  cachedAdapter = null;
  cachedKey = null;
}

export default { getCrmAdapter, getActiveCrmProvider, isCrmIntegrationEnabled, resetCrmAdapterCache };
