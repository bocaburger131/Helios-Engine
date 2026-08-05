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
  // Column breaks (x-coordinates) must survive learning → re-parse.
  // Persist on the template doc AND inside the mapping so the layout
  // object flowing into pdfplumber carries them.
  const explicitVerticalLines = normalizeExplicitVerticalLines(mappingForTemplate.explicitVerticalLines);
  const explicitHorizontalLines = normalizeExplicitHorizontalLines(mappingForTemplate.explicitHorizontalLines);
  if (explicitVerticalLines) {
    mappingForTemplate.explicitVerticalLines = explicitVerticalLines;
  }
  if (explicitHorizontalLines) {
    mappingForTemplate.explicitHorizontalLines = explicitHorizontalLines;
  }
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
          explicitVerticalLines: explicitVerticalLines || [],
          explicitHorizontalLines: explicitHorizontalLines || [],
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
 * @param {unknown} raw
 * @returns {number[] | null} sorted ascending x-coordinates, or null when empty/invalid
 */
function normalizeExplicitVerticalLines(raw) {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const nums = raw.map(Number).filter((n) => Number.isFinite(n));
  if (nums.length === 0) return null;
  return [...new Set(nums)].sort((a, b) => a - b);
}

/**
 * @param {unknown} raw
 * @returns {number[] | null} sorted ascending y-coordinates, or null when empty/invalid
 */
function normalizeExplicitHorizontalLines(raw) {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const nums = raw.map(Number).filter((n) => Number.isFinite(n));
  if (nums.length === 0) return null;
  return [...new Set(nums)].sort((a, b) => a - b);
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
    return {
      mapping: withTemplateExplicitLines(verified),
      version: verified.version,
      status: 'VERIFIED'
    };
  }
  const learning = templates
    .filter((t) => String(t.status || '').toUpperCase() === 'LEARNING')
    .sort((a, b) => (b.version || 0) - (a.version || 0));
  const top = learning[0];
  if (top?.mapping) {
    return {
      mapping: withTemplateExplicitLines(top),
      version: top.version,
      status: 'LEARNING'
    };
  }
  return null;
}

/**
 * Merge both vertical and horizontal explicit lines from template into mapping.
 * @param {object} template
 * @returns {object}
 */
function withTemplateExplicitLines(template) {
  let mapping = withTemplateExplicitVerticalLines(template);
  mapping = withTemplateExplicitHorizontalLines(template);
  return mapping;
}

/**
 * Merge template-level explicitVerticalLines into the mapping when the mapping
 * lacks them (covers templates persisted before the field existed).
 * @param {object} template — template subdocument
 * @returns {object} mapping clone with explicitVerticalLines attached
 */
function withTemplateExplicitVerticalLines(template) {
  const mapping = { ...template.mapping };
  const lines = normalizeExplicitVerticalLines(mapping.explicitVerticalLines) ||
    normalizeExplicitVerticalLines(template.explicitVerticalLines);
  if (lines) {
    mapping.explicitVerticalLines = lines;
  }
  return mapping;
}

/**
 * Merge template-level explicitHorizontalLines into the mapping when the mapping
 * lacks them (covers templates persisted before the field existed).
 * @param {object} template — template subdocument
 * @returns {object} mapping clone with explicitHorizontalLines attached
 */
function withTemplateExplicitHorizontalLines(template) {
  const mapping = { ...template.mapping };
  const lines = normalizeExplicitHorizontalLines(mapping.explicitHorizontalLines) ||
    normalizeExplicitHorizontalLines(template.explicitHorizontalLines);
  if (lines) {
    mapping.explicitHorizontalLines = lines;
  }
  return mapping;
}

export default { persistLearningTemplate, getLatestLearnableTemplate };
