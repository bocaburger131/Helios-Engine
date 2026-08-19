/**
 * Persist LEARNING layout templates on InstitutionalProfile (shared batch + single-upload).
 */
import InstitutionalProfile from '../models/InstitutionalProfile.js';
import logger from '../utils/logger.js';
import { withLayoutFingerprint, buildLayoutFingerprint } from './extraction/layoutFingerprintService.js';

const RESCUE_STATUSES = new Set([
  'DIAGNOSTIC_RESCUED',
  'PLUMBER_RESCUED',
  'AI_RESCUE_PASSED',
  'BLEED_RESCUED',
  'MISALIGNED_RESCUED'
]);

/**
 * Check whether a statement's templateCoordinateStatus indicates dynamic/rescue boundaries
 * were used (not a hardcoded Python profile).
 * @param {string|null|undefined} status
 * @returns {boolean}
 */
export function isRescueStatus(status) {
  return Boolean(status && RESCUE_STATUSES.has(status));
}

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
  if (explicitVerticalLines) {
    mappingForTemplate.explicitVerticalLines = explicitVerticalLines;
  }
  // explicitHorizontalLines are stripped before save — they are rescue-specific
  // and must never persist into verified templates.
  delete mappingForTemplate.explicitHorizontalLines;
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
 * Graduate a bank's layout template to VERIFIED status after a checksum-passing
 * extraction that used dynamic/rescue boundaries (not a hardcoded Python profile).
 * Upserts a VERIFIED template for the bank's InstitutionalProfile.
 *
 * @param {string} bankName
 * @param {number[]} explicitVerticalLines
 * @param {object} headerAnchors — { tableStart, tableEnd }
 * @returns {Promise<object|null>} the graduated template doc, or null on failure
 */
export async function graduationTemplate(bankName, explicitVerticalLines, headerAnchors) {
  if (!bankName) return null;

  const profile = await InstitutionalProfile.findOne({
    legalName: bankName
  }).lean();

  if (!profile) {
    logger.warn('[TEMPLATE_GRADUATION] No profile found for bank', { bankName });
    return null;
  }

  const normalizedVLines = normalizeExplicitVerticalLines(explicitVerticalLines);
  const normalizedAnchors =
    headerAnchors && typeof headerAnchors === 'object'
      ? {
          tableStart: String(headerAnchors.tableStart ?? ''),
          tableEnd: String(headerAnchors.tableEnd ?? '')
        }
      : { tableStart: '', tableEnd: '' };

  const maxVersion = Math.max(
    0,
    ...(profile.templates || []).map((t) => (Number.isFinite(t.version) ? t.version : 0))
  );
  const nextVersion = maxVersion + 1;

  const fingerprint = buildLayoutFingerprint({
    headerAnchors: normalizedAnchors,
    explicitVerticalLines: normalizedVLines
  });

  const mappingForTemplate = {
    headerAnchors: normalizedAnchors,
    ...(normalizedVLines ? { explicitVerticalLines: normalizedVLines } : {})
  };

  const templateDoc = {
    version: nextVersion,
    status: 'VERIFIED',
    consecutiveSuccesses: 0,
    totalProcessed: 0,
    layoutConfidence: null,
    parentTemplateVersion: null,
    fingerprint,
    explicitVerticalLines: normalizedVLines || [],
    mapping: mappingForTemplate
  };

  // Remove any existing VERIFIED template, then push the new one.
  await InstitutionalProfile.updateOne(
    { _id: profile._id },
    { $pull: { templates: { status: 'VERIFIED' } } }
  );

  await InstitutionalProfile.updateOne(
    { _id: profile._id },
    { $push: { templates: templateDoc } }
  );

  logger.info('[TEMPLATE_GRADUATION] VERIFIED template stored', {
    profileId: String(profile._id),
    bankName,
    version: nextVersion
  });

  return templateDoc;
}

/**
 * Look up a VERIFIED template for a given bank name.
 * @param {string} bankName
 * @returns {Promise<object|null>} the VERIFIED template doc, or null
 */
export async function getVerifiedTemplate(bankName) {
  if (!bankName) return null;

  const profile = await InstitutionalProfile.findOne({
    legalName: bankName
  }).lean();

  if (!profile || !profile.templates) return null;

  return profile.templates.find((t) => t.status === 'VERIFIED') ?? null;
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
 * Merge template-level explicitVerticalLines into the mapping when the mapping
 * lacks them (covers templates persisted before the field existed).
 * explicitHorizontalLines are intentionally NOT applied on load —
 * they are rescue-specific and must never persist into verified templates.
 * @param {object} template — template subdocument
 * @returns {object} mapping clone with explicitVerticalLines attached
 */
function withTemplateExplicitLines(template) {
  return withTemplateExplicitVerticalLines(template);
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

export default { persistLearningTemplate, getLatestLearnableTemplate, graduationTemplate, isRescueStatus, getVerifiedTemplate };
