/**
 * Persist LEARNING layout templates on InstitutionalProfile (shared batch + single-upload).
 */
import InstitutionalProfile from '../models/InstitutionalProfile.js';
import logger from '../utils/logger.js';
import { withLayoutFingerprint, buildLayoutFingerprint } from './extraction/layoutFingerprintService.js';

/**
 * @param {import('mongoose').Types.ObjectId | string} profileId
 * @param {object} mapping — layout mapping (headerAnchors, etc.)
 * @param {{ layoutConfidence?: number | null, parentTemplateVersion?: number | null }} [opts]
 * @returns {Promise<{ version: number, status: 'LEARNING' } | null>}
 */
export async function persistLearningTemplate(profileId, mapping, opts = {}) {
  if (!profileId || !mapping || typeof mapping !== 'object') return null;

  const profile = await InstitutionalProfile.findById(profileId).lean();
  if (!profile) {
    logger.warn('[TEMPLATE_PERSIST] Profile not found', { profileId: String(profileId) });
    return null;
  }

  const { layoutConfidence: layoutConfOmit, layoutFingerprint, ...mappingForTemplate } = withLayoutFingerprint(mapping);
  const fingerprint = layoutFingerprint || buildLayoutFingerprint(mapping);
  const maxVersion = Math.max(
    0,
    ...(profile.templates || []).map((t) => (Number.isFinite(t.version) ? t.version : 0))
  );
  const nextVersion = maxVersion + 1;

  await InstitutionalProfile.updateOne(
    { _id: profileId },
    {
      $push: {
        templates: {
          version: nextVersion,
          status: 'LEARNING',
          consecutiveSuccesses: 0,
          totalProcessed: 0,
          layoutConfidence: opts.layoutConfidence ?? mapping.layoutConfidence ?? null,
          parentTemplateVersion: opts.parentTemplateVersion ?? null,
          fingerprint,
          mapping: mappingForTemplate
        }
      }
    }
  );

  logger.info('[TEMPLATE_PERSIST] LEARNING template stored', {
    profileId: String(profileId),
    version: nextVersion
  });

  return { version: nextVersion, status: 'LEARNING' };
}

/**
 * Latest LEARNING or VERIFIED mapping for batch macro re-parse (no manuallyVerified gate).
 * @param {object | null} profile — lean InstitutionalProfile
 * @returns {{ mapping: object, version: number, status: string } | null}
 */
export function getLatestLearnableTemplate(profile) {
  const templates = profile?.templates || [];
  const verified = templates.find((t) => String(t.status || '').toUpperCase() === 'VERIFIED');
  if (verified?.mapping) {
    return { mapping: verified.mapping, version: verified.version, status: 'VERIFIED' };
  }
  const learning = templates
    .filter((t) => String(t.status || '').toUpperCase() === 'LEARNING')
    .sort((a, b) => (b.version || 0) - (a.version || 0));
  const top = learning[0];
  if (top?.mapping) {
    return { mapping: top.mapping, version: top.version, status: 'LEARNING' };
  }
  return null;
}

export default { persistLearningTemplate, getLatestLearnableTemplate };
