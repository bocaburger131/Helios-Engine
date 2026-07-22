/**
 * Immutable profile snapshot at parse time for historical re-display.
 * Live selection uses non-deprecated templates; history uses this snapshot.
 */
import { buildLayoutFingerprint } from './layoutFingerprintService.js';
import { getProfileMeta } from './bankProfileRegistry.js';

/**
 * Build a compact snapshot stamped onto Statement.metadata / parseManifest.
 * @param {object} input
 * @returns {object}
 */
export function buildProfileSnapshot(input = {}) {
  const profileId = input.profileId || null;
  const meta = profileId ? getProfileMeta(profileId) : {};
  const mapping = input.mapping || input.layoutTemplate || null;
  const fingerprint =
    input.layoutFingerprint ||
    mapping?.layoutFingerprint ||
    (mapping ? buildLayoutFingerprint(mapping) : null);

  const snapshot = {
    profileId,
    profileVersion:
      input.profileVersion ||
      mapping?.profileVersion ||
      meta.profileVersion ||
      '1',
    layoutFingerprint: fingerprint || null,
    templateId: input.templateId || mapping?._id?.toString?.() || null,
    templateVersion:
      input.templateVersion ?? mapping?.version ?? mapping?.templateVersion ?? null,
    effectiveFrom:
      input.effectiveFrom ||
      mapping?.effectiveFrom ||
      meta.effectiveFrom ||
      null,
    deprecatedAt: mapping?.deprecatedAt ?? meta.deprecatedAt ?? null,
    institutionalProfileId: input.institutionalProfileId || null,
    mappingSnapshot: null,
    documentMapSnapshot: input.documentMapSnapshot || mapping?.documentMapSnapshot || null
  };

  // Compact mapping copy for historical re-read when live variant is gone.
  if (mapping && typeof mapping === 'object') {
    snapshot.mappingSnapshot = {
      headerAnchors: mapping.headerAnchors ?? null,
      transactionSections: mapping.transactionSections ?? null,
      columnMapping: mapping.columnMapping ?? null,
      reconciliationSpec: mapping.reconciliationSpec ?? null,
      layoutFingerprint: fingerprint,
      profileVersion: snapshot.profileVersion,
      effectiveFrom: snapshot.effectiveFrom,
      deprecatedAt: snapshot.deprecatedAt
    };
  }

  return snapshot;
}

/**
 * Resolve mapping for historical display: prefer live template if still present;
 * else embedded snapshot.
 * @param {object} profileSnapshot
 * @param {object|null} liveTemplate — InstitutionalProfile template doc
 * @returns {{ mapping: object|null, source: 'live'|'snapshot'|'none' }}
 */
export function resolveMappingForHistoricalRead(profileSnapshot, liveTemplate) {
  if (liveTemplate?.mapping && !liveTemplate.deprecatedAt) {
    return { mapping: liveTemplate.mapping, source: 'live' };
  }
  if (liveTemplate?.mapping && liveTemplate.deprecatedAt) {
    // Prefer snapshot if fingerprint matches; else still allow live deprecated for audit
    if (
      profileSnapshot?.mappingSnapshot &&
      profileSnapshot.layoutFingerprint &&
      (liveTemplate.fingerprint === profileSnapshot.layoutFingerprint ||
        liveTemplate.mapping?.layoutFingerprint === profileSnapshot.layoutFingerprint)
    ) {
      return { mapping: profileSnapshot.mappingSnapshot, source: 'snapshot' };
    }
    return { mapping: liveTemplate.mapping, source: 'live_deprecated' };
  }
  if (profileSnapshot?.mappingSnapshot) {
    return { mapping: profileSnapshot.mappingSnapshot, source: 'snapshot' };
  }
  return { mapping: null, source: 'none' };
}

/**
 * Attach snapshot onto parse result metadata + manifest.
 * @param {object} parseResult
 * @param {object} snapshotInput
 */
export function stampProfileSnapshot(parseResult, snapshotInput = {}) {
  if (!parseResult) return parseResult;
  const snapshot = buildProfileSnapshot(snapshotInput);
  parseResult.metadata = parseResult.metadata || {};
  parseResult.metadata.profileSnapshot = snapshot;
  if (parseResult.metadata.parseManifest) {
    parseResult.metadata.parseManifest.profileSnapshot = snapshot;
    parseResult.metadata.parseManifest.profileVersion = snapshot.profileVersion;
  }
  return parseResult;
}

export default {
  buildProfileSnapshot,
  resolveMappingForHistoricalRead,
  stampProfileSnapshot
};
