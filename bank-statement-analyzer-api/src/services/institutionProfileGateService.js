/**
 * Step 1 — institution profile gate for production underwriting.
 * Code profile (Tier-1) + InstitutionalProfile VERIFIED template required.
 */

import { RTN_BANK_MAP } from '../config/bankIdentifiers.js';
import { isDemoMode } from '../config/appMode.js';
import {
  resolveProfile,
  getProfileMeta,
  isTier1CodeProfile
} from './extraction/bankProfileRegistry.js';
import { getLatestLearnableTemplate } from './institutionalTemplatePersist.js';

const DETECT_THRESHOLD = Number(process.env.BANK_PROFILE_DETECT_THRESHOLD) || 0.8;

/**
 * @param {string} text
 * @returns {string|null}
 */
export function scanRtnFromText(text) {
  const body = String(text || '');
  const rtnContextPattern = /(?:routing|aba|transit|rtn)[^\d]{0,30}(\d{9})/gi;
  let m;
  while ((m = rtnContextPattern.exec(body)) !== null) {
    if (RTN_BANK_MAP[m[1]]) return m[1];
  }
  const bare = body.match(/\b(\d{9})\b/g) || [];
  for (const digits of bare) {
    if (RTN_BANK_MAP[digits]) return digits;
  }
  return null;
}

/**
 * @param {object} input
 * @param {string} [input.text]
 * @param {string} [input.rtn]
 * @param {string} [input.bankName]
 * @param {object|null} [input.institutionalProfile] — lean InstitutionalProfile doc
 * @returns {object}
 */
export function assessInstitutionProfileGate(input = {}) {
  const {
    text,
    rtn,
    bankName,
    institutionalProfile,
    layoutDiscoveryPresent,
    checksumPassRatio
  } = input;
  const resolvedRtn = rtn ?? scanRtnFromText(text);
  const mappedBank = resolvedRtn ? RTN_BANK_MAP[resolvedRtn] : null;

  const profile = resolveProfile({
    text: text || '',
    rtn: resolvedRtn,
    bankName: bankName || mappedBank
  });
  const profileMeta = getProfileMeta(profile.id);
  const tier1CodeProfile =
    isTier1CodeProfile(profile.id) && Number(profile.confidence) >= DETECT_THRESHOLD;
  const genericLowConfidence =
    profile.id === 'generic_digital' && Number(profile.confidence) < DETECT_THRESHOLD;
  const probeOnly = genericLowConfidence || !tier1CodeProfile;

  const template = institutionalProfile ? getLatestLearnableTemplate(institutionalProfile) : null;
  const templateVerified = String(template?.status || '').toUpperCase() === 'VERIFIED';

  let profileStatus = 'MISSING';
  if (institutionalProfile) {
    profileStatus = templateVerified ? 'VERIFIED' : template ? 'LEARNING' : 'LEARNING';
  } else if (tier1CodeProfile) {
    profileStatus = 'LEARNING';
  } else if (probeOnly) {
    profileStatus = 'MISSING';
  }

  const checksumRateOk =
    checksumPassRatio == null || Number(checksumPassRatio) >= 0.8;

  const layoutMapped = layoutDiscoveryPresent === true;

  const productionReady =
    tier1CodeProfile && templateVerified && layoutMapped && checksumRateOk;

  const step1Required =
    !resolvedRtn || !layoutMapped || genericLowConfidence;

  const layoutLearningActive = isDemoMode() && step1Required;

  let layoutDiscoveryStatus = 'unknown';
  if (layoutDiscoveryPresent === true) layoutDiscoveryStatus = 'complete';
  else if (layoutDiscoveryPresent === false) layoutDiscoveryStatus = 'failed';

  return {
    step: 1,
    step1Required,
    layoutLearningActive,
    productionReady,
    probeOnly,
    profileStatus,
    layoutDiscoveryStatus,
    layoutMapped,
    codeProfileId: profile.id,
    codeProfileConfidence: Number(profile.confidence?.toFixed?.(3) ?? profile.confidence),
    strictProfile: profileMeta.strictProfile,
    templateStatus: template?.status ?? null,
    templateVersion: template?.version ?? null,
    routingNumber: resolvedRtn,
    bankName: bankName || mappedBank || institutionalProfile?.legalName || null,
    institutionalProfileId: institutionalProfile?._id
      ? String(institutionalProfile._id)
      : null,
    recommendation: productionReady
      ? null
      : layoutLearningActive
        ? 'Layout learning active — checksums improve as templates graduate to VERIFIED.'
        : !layoutMapped
          ? 'Run layout discovery on every statement before production underwriting.'
          : probeOnly
            ? 'Create institution profile (Step 1): scaffold Tier-1 code profile + Python slug + golden tests before production underwriting.'
            : templateVerified
              ? checksumRateOk
                ? null
                : 'Improve checksum pass rate to at least 80% before production underwriting.'
              : 'Complete template graduation (5 consecutive checksum passes) to VERIFIED before production underwriting.'
  };
}

/**
 * Whether batch macro analysis may proceed when Step 1 institution profile is incomplete.
 * Explicit `allowProbeAnalysis` body field wins; else INSTITUTION_PROFILE_PROBE_DEFAULT;
 * when unset, non-production environments default to probe-allowed.
 * @param {import('express').Request} req
 * @returns {boolean}
 */
export function isProbeAnalysisAllowed(req) {
  const raw = req?.body?.allowProbeAnalysis;
  if (raw === true || raw === 'true' || raw === '1') return true;
  if (raw === false || raw === 'false' || raw === '0') return false;

  if (isDemoMode()) return true;

  const envFlag = process.env.INSTITUTION_PROFILE_PROBE_DEFAULT;
  if (envFlag === 'true') return true;
  if (envFlag === 'false') return false;
  return process.env.NODE_ENV !== 'production';
}

export default { scanRtnFromText, assessInstitutionProfileGate, isProbeAnalysisAllowed };
