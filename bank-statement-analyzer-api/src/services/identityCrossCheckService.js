/**
 * Identity cross-check — statement header vs loan application metadata.
 */

import { fuzzyMatch } from '../utils/stringUtils.js';
import { crossCheckIdentity } from './extraction/layoutPipeline/veraReconciliationFallback.js';
import { validateData } from '../validation/validateData.js';
import { alertSchema } from '../validation/alertSchema.js';
import logger from '../utils/logger.js';

/**
 * @param {object} identityMap
 * @param {object} applicationContext
 * @param {object} [extractedAnchorData]
 * @returns {object}
 */
export function crossCheckIdentityAgainstApplication(
  identityMap,
  applicationContext = {},
  extractedAnchorData = {}
) {
  const mergedContext = {
    ...extractedAnchorData,
    ...applicationContext,
    companyName:
      applicationContext.companyName ||
      extractedAnchorData.companyName ||
      extractedAnchorData.dbaName,
    taxId: applicationContext.taxId || extractedAnchorData.taxId
  };

  const documentMap = { identity: identityMap };
  const result = crossCheckIdentity(documentMap, mergedContext);

  if (identityMap?.dba && mergedContext.companyName) {
    const dbaScore = fuzzyMatch(identityMap.dba, mergedContext.companyName);
    if (dbaScore < 0.65 && result.status === 'pass') {
      result.status = 'review';
      result.mismatches.push({
        field: 'dba',
        expected: mergedContext.companyName,
        observed: identityMap.dba,
        score: dbaScore
      });
    }
  }

  return result;
}

/**
 * Build IDENTITY_MISMATCH alert for macro batch.
 * @param {object} crossCheck
 * @param {string} fileName
 * @returns {object|null}
 */
export function buildIdentityMismatchAlert(crossCheck, fileName = 'statement') {
  if (!crossCheck || crossCheck.status === 'pass') return null;
  const alert = {
    code: 'IDENTITY_MISMATCH',
    type: 'COMPLIANCE',
    severity: crossCheck.status === 'mismatch' ? 'HIGH' : 'MEDIUM',
    title: 'Statement identity cross-check',
    message: `Identity cross-check ${crossCheck.status} for ${fileName}`,
    recommendation: 'Verify legal name, DBA, and tax ID against the loan application.',
    data: {
      mismatches: crossCheck.mismatches,
      confidence: crossCheck.confidence
    }
  };
  // Validate alert shape at creation time
  const validation = validateData(alertSchema, alert, { label: 'buildIdentityMismatchAlert' });
  if (!validation.ok) {
    logger.warn('buildIdentityMismatchAlert produced invalid alert shape', {
      errors: validation.errors.slice(0, 3),
    });
  }
  return alert;
}

export default {
  crossCheckIdentityAgainstApplication,
  buildIdentityMismatchAlert
};
