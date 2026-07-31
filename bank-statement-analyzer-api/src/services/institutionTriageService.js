/**
 * Institution Triage Service — 3-scenario decision tree for template evolution detection.
 *
 * Sits between anchor-check failure and Gemini re-learn.
 * Determines WHY a stored template didn't match and WHERE this statement belongs.
 */
import InstitutionalProfile from '../models/InstitutionalProfile.js';
import { searchAllProfilesForFingerprint } from './crossProfileFingerprintMatcher.js';
import logger from '../utils/logger.js';

// ──────────────────────────────────────────────
//  Helpers
// ──────────────────────────────────────────────

/**
 * Extract section labels from a fingerprint string.
 * Format: "a:anchor1|anchor2::s:section1|section2"
 */
function sectionsFromFingerprint(fp) {
  if (!fp) return [];
  const sectionPart = fp.split('::s:')[1];
  if (!sectionPart) return [];
  return sectionPart.split('|').filter(Boolean).map(s => s.toLowerCase().trim());
}

/**
 * Normalize a bank name for fuzzy comparison.
 */
function normalizeName(name) {
  return (name || '').toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
}

/**
 * Map the flat result array from crossProfileFingerprintMatcher into
 * { exactMatches, sectionOverlaps } grouped by matchType.
 */
function partitionCrossProfileResults(results) {
  const exactMatches = [];
  const sectionOverlaps = [];
  for (const r of results) {
    const mapped = {
      profileId: r.profileId,
      profileName: r.legalName,
      rtn: r.routingNumber,
      overlapRatio: r.confidence
    };
    if (r.matchType === 'EXACT_FINGERPRINT') {
      exactMatches.push(mapped);
    } else if (r.matchType === 'SECTION_OVERLAP') {
      sectionOverlaps.push(mapped);
    }
  }
  return { exactMatches, sectionOverlaps };
}

// ──────────────────────────────────────────────
//  detectFormatEvolution
// ──────────────────────────────────────────────

/**
 * Compare incoming section labels against an existing template's section labels.
 *
 * @param {string[]} incomingLabels - section labels from the new statement
 * @param {string[]} existingLabels - section labels from the stored template
 * @returns {{ isEvolution: boolean, overlapRatio: number, newSections: string[], missingSections: string[] }}
 */
export function detectFormatEvolution(incomingLabels, existingLabels) {
  const inc = (incomingLabels || []).map(s => s.toLowerCase().trim());
  const exist = (existingLabels || []).map(s => s.toLowerCase().trim());

  if (!inc.length) {
    return { isEvolution: false, overlapRatio: 0, newSections: [], missingSections: [] };
  }

  const existSet = new Set(exist);
  const incSet = new Set(inc);

  const matching = inc.filter(s => existSet.has(s));
  const overlapRatio = matching.length / inc.length;
  const isEvolution = overlapRatio >= 0.5;

  const newSections = inc.filter(s => !existSet.has(s));
  const missingSections = exist.filter(s => !incSet.has(s));

  return { isEvolution, overlapRatio, newSections, missingSections };
}

// ──────────────────────────────────────────────
//  triageLayoutMismatch  (3-scenario decision tree)
// ──────────────────────────────────────────────

/**
 * Determine why a stored template didn't match and decide where this statement belongs.
 *
 * @param {object} params
 * @param {string} params.incomingFingerprint
 * @param {import('mongoose').Types.ObjectId} params.expectedProfileId
 * @param {string} params.expectedProfileRtn
 * @param {string} params.expectedProfileName
 * @param {string} params.parsedBankName
 * @param {string[]} params.incomingSectionLabels
 * @param {number} params.existingTemplateVersion
 * @param {string} params.existingTemplateFingerprint
 * @returns {Promise<{
 *   action: string,
 *   targetProfileId: ObjectId|null,
 *   targetProfileName: string|null,
 *   relationshipType: string|null,
 *   parentTemplateVersion: number|null,
 *   reason: string
 * }>}
 */
export async function triageLayoutMismatch({
  incomingFingerprint,
  expectedProfileId,
  expectedProfileRtn,
  expectedProfileName,
  parsedBankName,
  incomingSectionLabels,
  existingTemplateVersion,
  existingTemplateFingerprint
}) {
  // ── STEP A: Cross-profile fingerprint search ──
  // Extract section labels from the incoming fingerprint for fuzzy matching
  const incomingSections = sectionsFromFingerprint(incomingFingerprint);
  const crossResults = await searchAllProfilesForFingerprint(incomingFingerprint, {
    excludeProfileId: String(expectedProfileId),
    sectionLabels: incomingSections
  });

  const { exactMatches, sectionOverlaps } = partitionCrossProfileResults(crossResults);

  // A1: Exact fingerprint match to a different profile → WRONG_INSTITUTION (white-label)
  if (exactMatches.length > 0) {
    const match = exactMatches[0];
    logger.info('Triage: exact cross-profile fingerprint match', {
      expected: expectedProfileName,
      matched: match.profileName,
      rtn: match.rtn
    });
    return {
      action: 'WRONG_INSTITUTION',
      targetProfileId: match.profileId,
      targetProfileName: match.profileName,
      relationshipType: 'WHITE_LABEL_PROCESSOR',
      parentTemplateVersion: null,
      reason: `Exact layout fingerprint match to "${match.profileName}" (RTN ${match.rtn}). ` +
        `Likely white-label processor sharing identical statement format.`
    };
  }

  // A2: Section overlap to a different profile → WRONG_INSTITUTION (lower confidence)
  if (sectionOverlaps.length > 0) {
    const best = sectionOverlaps.sort((a, b) => b.overlapRatio - a.overlapRatio)[0];
    logger.info('Triage: section-overlap cross-profile match', {
      expected: expectedProfileName,
      matched: best.profileName,
      overlapRatio: best.overlapRatio
    });
    return {
      action: 'WRONG_INSTITUTION',
      targetProfileId: best.profileId,
      targetProfileName: best.profileName,
      relationshipType: 'WHITE_LABEL_CLIENT',
      parentTemplateVersion: null,
      reason: `Section overlap (${(best.overlapRatio * 100).toFixed(0)}%) with "${best.profileName}" ` +
        `(RTN ${best.rtn}). Possible white-label client sharing similar layout.`
    };
  }

  // ── STEP B: Bank name mismatch check ──
  const parsedNorm = normalizeName(parsedBankName);
  const expectedNorm = normalizeName(expectedProfileName);

  if (parsedNorm && parsedNorm !== expectedNorm) {
    // Fetch the expected profile to check aliases
    const expectedProfile = await InstitutionalProfile.findById(expectedProfileId)
      .select('aliases legalName')
      .lean();

    // B1: Check if parsed name is an alias on the expected profile
    if (expectedProfile?.aliases?.length) {
      const isAlias = expectedProfile.aliases.some(
        a => normalizeName(a) === parsedNorm
      );
      if (isAlias) {
        logger.info('Triage: bank name is a known alias', {
          parsed: parsedBankName,
          expected: expectedProfileName
        });
        return {
          action: 'NAME_ALIAS',
          targetProfileId: expectedProfileId,
          targetProfileName: expectedProfileName,
          relationshipType: 'NAME_ALIAS',
          parentTemplateVersion: null,
          reason: `"${parsedBankName}" is a registered alias for "${expectedProfileName}". ` +
            `Same institution, different display name.`
        };
      }
    }

    // B2: Check if parsed name matches a DIFFERENT profile's legalName
    const nameMatch = await InstitutionalProfile.findOne({
      _id: { $ne: expectedProfileId },
      status: 'ACTIVE',
      legalName: { $regex: new RegExp(`^${parsedNorm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') }
    }).select('_id legalName routingNumber').lean();

    if (nameMatch) {
      logger.info('Triage: bank name matches different profile', {
        parsed: parsedBankName,
        matched: nameMatch.legalName,
        rtn: nameMatch.routingNumber
      });
      return {
        action: 'WRONG_INSTITUTION',
        targetProfileId: nameMatch._id,
        targetProfileName: nameMatch.legalName,
        relationshipType: 'WHITE_LABEL_CLIENT',
        parentTemplateVersion: null,
        reason: `Parsed bank name "${parsedBankName}" matches "${nameMatch.legalName}" ` +
          `(RTN ${nameMatch.routingNumber}) instead of expected "${expectedProfileName}".`
      };
    }
  }

  // ── STEP C: Partial section match (format evolution) ──
  const existingSections = sectionsFromFingerprint(existingTemplateFingerprint);
  const { isEvolution, overlapRatio, newSections, missingSections } =
    detectFormatEvolution(incomingSectionLabels, existingSections);

  if (isEvolution) {
    logger.info('Triage: format evolution detected', {
      profile: expectedProfileName,
      overlapRatio,
      newSections: newSections.join(', '),
      missingSections: missingSections.join(', ')
    });
    return {
      action: 'FORMAT_CHANGE',
      targetProfileId: expectedProfileId,
      targetProfileName: expectedProfileName,
      relationshipType: 'FORMAT_EVOLUTION',
      parentTemplateVersion: existingTemplateVersion,
      reason: `Format evolution detected (${(overlapRatio * 100).toFixed(0)}% section overlap). ` +
        `New sections: [${newSections.join(', ') || 'none'}]. ` +
        `Missing sections: [${missingSections.join(', ') || 'none'}].`
    };
  }

  // ── STEP D: Default — learn fresh ──
  logger.info('Triage: no match found, recommending fresh learn', {
    profile: expectedProfileName,
    fingerprint: incomingFingerprint.substring(0, 60)
  });
  return {
    action: 'LEARN_FRESH',
    targetProfileId: expectedProfileId,
    targetProfileName: expectedProfileName,
    relationshipType: null,
    parentTemplateVersion: null,
    reason: `No cross-profile match, no name alias, and insufficient section overlap ` +
      `(below 50%). Treating as entirely new layout for "${expectedProfileName}".`
  };
}

// ──────────────────────────────────────────────
//  createRelationship
// ──────────────────────────────────────────────

/**
 * Add a relationship entry to an InstitutionalProfile.
 * Creates bidirectional links for WHITE_LABEL_PROCESSOR → WHITE_LABEL_CLIENT.
 * Updates lastSeenAt if the relationship already exists.
 *
 * @param {import('mongoose').Types.ObjectId} profileId
 * @param {object} relationshipData
 * @param {string} relationshipData.type
 * @param {import('mongoose').Types.ObjectId} relationshipData.targetProfileId
 * @param {string} [relationshipData.targetRtn]
 * @param {number} [relationshipData.confidence]
 * @returns {Promise<object>} the updated profile
 */
export async function createRelationship(profileId, relationshipData) {
  const { type, targetProfileId, targetRtn = '', confidence = 0 } = relationshipData;

  const profile = await InstitutionalProfile.findById(profileId);
  if (!profile) {
    throw new Error(`InstitutionalProfile not found: ${profileId}`);
  }

  // Check if relationship already exists
  const existing = profile.relationships.find(
    r => r.type === type && String(r.targetProfileId) === String(targetProfileId)
  );

  if (existing) {
    existing.lastSeenAt = new Date();
    if (confidence > existing.confidence) {
      existing.confidence = confidence;
    }
    await profile.save();
    logger.debug('Relationship updated (lastSeenAt)', {
      profileId: String(profileId),
      type,
      targetProfileId: String(targetProfileId)
    });
    return profile;
  }

  // Add new relationship
  profile.relationships.push({
    type,
    targetProfileId,
    targetRtn,
    confidence,
    firstSeenAt: new Date(),
    lastSeenAt: new Date()
  });
  await profile.save();

  logger.info('Relationship created', {
    profileId: String(profileId),
    type,
    targetProfileId: String(targetProfileId)
  });

  // Bidirectional: if WHITE_LABEL_PROCESSOR, create WHITE_LABEL_CLIENT on the other profile
  if (type === 'WHITE_LABEL_PROCESSOR' && targetProfileId) {
    const targetProfile = await InstitutionalProfile.findById(targetProfileId);
    if (targetProfile) {
      const reciprocalExisting = targetProfile.relationships.find(
        r => r.type === 'WHITE_LABEL_CLIENT' && String(r.targetProfileId) === String(profileId)
      );
      if (reciprocalExisting) {
        reciprocalExisting.lastSeenAt = new Date();
      } else {
        targetProfile.relationships.push({
          type: 'WHITE_LABEL_CLIENT',
          targetProfileId: profileId,
          targetRtn: profile.routingNumber,
          confidence,
          firstSeenAt: new Date(),
          lastSeenAt: new Date()
        });
      }
      await targetProfile.save();
      logger.info('Bidirectional relationship created', {
        from: String(profileId),
        to: String(targetProfileId),
        reciprocal: 'WHITE_LABEL_CLIENT'
      });
    }
  }

  return profile;
}

export default {
  triageLayoutMismatch,
  createRelationship,
  detectFormatEvolution
};