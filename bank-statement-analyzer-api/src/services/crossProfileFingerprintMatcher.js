/**
 * Cross-profile fingerprint matcher for template evolution detection.
 * When a statement's RTN matches one profile but the layout fingerprint
 * doesn't, this searches ALL profiles to detect white-label processing,
 * format evolution, or acquisition relationships.
 *
 * @license Copyright (c) 2025 Shift 4 Financial INC
 */

import InstitutionalProfile from '../models/InstitutionalProfile.js';
import logger from '../utils/logger.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildIdFilter(excludeProfileId, exactProfileIds) {
  const exclude = [];
  if (excludeProfileId) exclude.push(excludeProfileId);
  for (const id of exactProfileIds) exclude.push(id);
  return exclude.length > 0 ? { _id: { $nin: exclude } } : {};
}

/** Jaccard-style overlap confidence between two label arrays. 0.0–1.0 */
function sectionOverlapConfidence(a, b) {
  const setA = new Set(a), setB = new Set(b);
  let overlap = 0;
  for (const item of setA) if (setB.has(item)) overlap++;
  const union = new Set([...setA, ...setB]).size;
  return union === 0 ? 0 : Math.round((overlap / union) * 100) / 100;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Search ALL institutional profiles for templates matching a fingerprint.
 *
 * @param {string} fingerprint       Layout fingerprint string to match.
 * @param {object} [options]
 * @param {string} [options.excludeProfileId]  Profile ID to exclude.
 * @param {string[]} [options.sectionLabels]   Section labels extracted from
 *          the fingerprint for fuzzy overlap matching.
 * @returns {Promise<Array<{profileId, routingNumber, legalName,
 *          templateVersion, matchType, confidence}>>}
 */
export async function searchAllProfilesForFingerprint(fingerprint, options = {}) {
  const { excludeProfileId, sectionLabels = [] } = options;
  const results = [];
  const seen = new Set();
  const exactProfileIds = new Set();

  // Pass 1: exact fingerprint match
  const exactFilter = buildIdFilter(excludeProfileId, []);
  exactFilter['templates.fingerprint'] = fingerprint;
  const exactProfiles = await InstitutionalProfile.find(exactFilter).lean();
  for (const profile of exactProfiles) {
    for (const template of profile.templates || []) {
      if (template.fingerprint !== fingerprint) continue;
      const key = String(profile._id) + '::' + String(template._id);
      if (seen.has(key)) continue;
      seen.add(key);
      exactProfileIds.add(String(profile._id));
      results.push({
        profileId: profile._id, routingNumber: profile.routingNumber,
        legalName: profile.legalName, templateVersion: template.version,
        matchType: 'EXACT_FINGERPRINT', confidence: 1.0,
      });
    }
  }

  // Pass 2: section-label overlap (fuzzy)
  if (sectionLabels.length > 0) {
    const fuzzyFilter = buildIdFilter(excludeProfileId, exactProfileIds);
    fuzzyFilter['templates.mapping.transactionSections.label'] = { $in: sectionLabels };
    const fuzzyProfiles = await InstitutionalProfile.find(fuzzyFilter).lean();
    for (const profile of fuzzyProfiles) {
      for (const template of profile.templates || []) {
        const tplLabels = (template.mapping?.transactionSections || [])
          .map((s) => s.label).filter(Boolean);
        if (tplLabels.length === 0) continue;
        const key = String(profile._id) + '::' + String(template._id);
        if (seen.has(key)) continue;
        const confidence = sectionOverlapConfidence(sectionLabels, tplLabels);
        if (confidence === 0) continue;
        seen.add(key);
        results.push({
          profileId: profile._id, routingNumber: profile.routingNumber,
          legalName: profile.legalName, templateVersion: template.version,
          matchType: 'SECTION_OVERLAP', confidence,
        });
      }
    }
  }

  logger.info('Cross-profile fingerprint search complete', {
    fingerprint: fingerprint.substring(0, 40),
    sectionLabelCount: sectionLabels.length,
    totalMatches: results.length,
    exactMatches: results.filter((r) => r.matchType === 'EXACT_FINGERPRINT').length,
  });
  results.sort((a, b) => b.confidence - a.confidence);
  return results;
}

/**
 * Find all profiles whose relationships array points to the given profile.
 * Used to discover existing white-label / format-evolution relationships.
 */
export async function findRelatedProfiles(profileId) {
  const profiles = await InstitutionalProfile.find({
    'relationships.targetProfileId': profileId,
  }).lean();
  logger.info('Related profiles lookup', {
    targetProfileId: String(profileId), relatedCount: profiles.length,
  });
  return profiles.map((p) => ({
    profileId: p._id, routingNumber: p.routingNumber, legalName: p.legalName,
    relationships: (p.relationships || []).filter(
      (r) => String(r.targetProfileId) === String(profileId),
    ),
  }));
}

/**
 * Lightweight map of every profile ID → array of template fingerprints.
 * For bulk comparison without repeated DB round-trips.
 *
 * @returns {Promise<Record<string, string[]>>}
 */
export async function getAllProfileFingerprints() {
  const profiles = await InstitutionalProfile.find(
    {}, { 'templates.fingerprint': 1 },
  ).lean();
  const map = {};
  for (const profile of profiles) {
    const fps = (profile.templates || [])
      .map((t) => t.fingerprint).filter(Boolean);
    if (fps.length > 0) map[String(profile._id)] = fps;
  }
  logger.info('Bulk fingerprint map built', {
    profileCount: Object.keys(map).length,
    totalFingerprints: Object.values(map).flat().length,
  });
  return map;
}
