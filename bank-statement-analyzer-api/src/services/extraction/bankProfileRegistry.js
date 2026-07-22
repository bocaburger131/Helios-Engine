/**

 * Bank statement extraction profile registry.

 */

import * as wellsInitiate from './profiles/wellsFargoInitiateProfile.js';

import * as chaseBusiness from './profiles/chaseBusinessCompleteProfile.js';

import * as regionsBusiness from './profiles/regionsBusinessCheckingProfile.js';

import * as genericDigital from './profiles/genericDigitalProfile.js';

import logger from '../../utils/logger.js';

import { getReconciliationSpec } from './reconciliationSpec.js';



/**
 * Declarative per-profile behavior flags. Shared orchestration code must key on
 * these flags — never on profile IDs or bank names.
 *
 * - strictProfile: pipeline result only accepted at tier 1 with checksum OK
 * - blockLegacyFallback: never fall through to the legacy line extractor
 * - fullContextExtract: profile.extract receives the full pipeline ctx
 * - recoveryEligible: document map recovery passes may run
 * - retainProfileRowsOnFailure: keep profile rows instead of legacy extract when pipeline fails
 * - reconciliationErrorName: error name thrown by the profile's reconciliation gate
 * - recoveryHooks.nearMiss / recoveryHooks.plumber: profile-supplied recovery functions
 * - plumberTxnKey: pipelineResult/error key carrying recovered plumber rows
 * - plumberLayoutProfile: structural layout profile passed to the Python sidecar
 * - sectionAnchorMode: legacy extractor section gating ('transaction_history_strict' | 'multi_table')
 * - fastGeminiRecovery: optional Gemini row-extraction rescue config
 * - exposeLegacyReconciliationField: emit metadata.wellsReconciliation (legacy consumers)
 * - fallbackRtn: institution RTN assumed when the statement never prints one
 */
const PROFILE_META = Object.freeze({

  [wellsInitiate.PROFILE_ID]: {
    strictProfile: true,
    blockLegacyFallback: true,
    skipLegacyTextFallback: true,
    profileVersion: '1',
    effectiveFrom: '2024-01-01',
    deprecatedAt: null,
    reconciliationSpec: getReconciliationSpec(wellsInitiate.PROFILE_ID),
    displayName: 'Wells',
    logTag: 'WELLS_INITIATE',
    reconciliationErrorName: 'WellsParseReconciliationError',
    fullContextExtract: false,
    recoveryEligible: true,
    retainProfileRowsOnFailure: true,
    exposeLegacyReconciliationField: true,
    sectionAnchorMode: 'transaction_history_strict',
    fastGeminiRecovery: {
      enabledEnv: 'WELLS_INITIATE_FAST_GEMINI',
      extractSummary: wellsInitiate.extractSummary
    },
    recoveryHooks: { nearMiss: wellsInitiate.tryRecoverWellsNearMiss },
    plumberTxnKey: null,
    plumberLayoutProfile: 'txn_history_dual_amount'
  },

  [chaseBusiness.PROFILE_ID]: {
    strictProfile: true,
    blockLegacyFallback: true,
    skipLegacyTextFallback: true,
    profileVersion: '1',
    effectiveFrom: '2024-01-01',
    deprecatedAt: null,
    reconciliationSpec: getReconciliationSpec(chaseBusiness.PROFILE_ID),
    displayName: 'Chase',
    logTag: 'CHASE_BUSINESS',
    reconciliationErrorName: 'ChaseParseReconciliationError',
    fullContextExtract: true,
    recoveryEligible: true,
    recoveryHooks: { plumber: chaseBusiness.tryRecoverChaseFromPlumber },
    plumberTxnKey: 'chasePlumberTransactions',
    plumberLayoutProfile: 'section_typed_activity'
  },

  [regionsBusiness.PROFILE_ID]: {
    strictProfile: true,
    blockLegacyFallback: true,
    skipLegacyTextFallback: true,
    profileVersion: '1',
    effectiveFrom: '2024-01-01',
    deprecatedAt: null,
    reconciliationSpec: getReconciliationSpec(regionsBusiness.PROFILE_ID),
    displayName: 'Regions',
    logTag: 'REGIONS_BUSINESS',
    reconciliationErrorName: 'RegionsParseReconciliationError',
    fullContextExtract: true,
    recoveryEligible: true,
    recoveryHooks: { plumber: regionsBusiness.tryRecoverRegionsFromPlumber },
    plumberTxnKey: 'regionsPlumberTransactions',
    plumberLayoutProfile: 'multi_table_sections',
    // Regions statements never print an RTN; Mississippi charter routing number.
    fallbackRtn: '062001186'
  },

  [genericDigital.PROFILE_ID]: {
    strictProfile: false,
    blockLegacyFallback: false,
    skipLegacyTextFallback: false,
    profileVersion: '1',
    effectiveFrom: '2024-01-01',
    deprecatedAt: null,
    reconciliationSpec: getReconciliationSpec(genericDigital.PROFILE_ID),
    displayName: 'Generic',
    logTag: 'GENERIC_DIGITAL',
    fullContextExtract: true,
    recoveryEligible: true,
    plumberLayoutProfile: 'generic'
  }

});



const PROFILES = [

  {

    id: wellsInitiate.PROFILE_ID,

    detect: wellsInitiate.detect,

    extract: wellsInitiate.extract,

    extractRaw: wellsInitiate.extractRaw

  },

  {

    id: chaseBusiness.PROFILE_ID,

    detect: chaseBusiness.detect,

    extract: chaseBusiness.extract,

    extractRaw: chaseBusiness.extractRaw

  },

  {

    id: regionsBusiness.PROFILE_ID,

    detect: regionsBusiness.detect,

    extract: regionsBusiness.extract,

    extractRaw: regionsBusiness.extractRaw

  },

  {

    id: genericDigital.PROFILE_ID,

    detect: genericDigital.detect,

    extract: genericDigital.extract,

    extractRaw: genericDigital.extractRaw

  }

];



const DETECT_THRESHOLD = Number(process.env.BANK_PROFILE_DETECT_THRESHOLD) || 0.8;



/**

 * @param {string} profileId

 * @returns {{ strictProfile: boolean, blockLegacyFallback: boolean }}

 */

export function getProfileMeta(profileId) {

  return (
    PROFILE_META[profileId] ?? {
      strictProfile: false,
      blockLegacyFallback: false,
      reconciliationSpec: getReconciliationSpec(genericDigital.PROFILE_ID)
    }
  );

}



/**

 * @param {object} input

 * @param {string} input.text

 * @param {string} [input.rtn]

 * @param {string} [input.bankName]

 * @param {string} [input.profileId] — force profile

 * @returns {{ id: string, detect: Function, extract: Function, extractRaw?: Function, confidence: number }}

 */

export function resolveProfile(input = {}) {

  const { text, profileId } = input;



  if (profileId) {

    const forced = PROFILES.find((p) => p.id === profileId);

    if (forced) {

      return { ...forced, confidence: 1, ...getProfileMeta(forced.id) };

    }

  }



  let best = PROFILES.find((p) => p.id === genericDigital.PROFILE_ID);

  let bestScore = genericDigital.detect(text);



  for (const profile of PROFILES) {

    if (profile.id === genericDigital.PROFILE_ID) continue;

    const score = profile.detect(text);

    if (score > bestScore) {

      bestScore = score;

      best = profile;

    }

  }



  if (best.id !== genericDigital.PROFILE_ID && bestScore < DETECT_THRESHOLD) {

    best = PROFILES.find((p) => p.id === genericDigital.PROFILE_ID);

    bestScore = genericDigital.detect(text);

  }

  logger.info('[EXTRACTION_PROFILE]', {

    profileId: best.id,

    confidence: Number(bestScore.toFixed(3)),

    rtn: input.rtn ?? null,

    bankName: input.bankName ?? null

  });



  return { ...best, confidence: bestScore, ...getProfileMeta(best.id) };

}



export function listProfiles() {

  return PROFILES.map((p) => p.id);

}



/**

 * @returns {string[]}

 */

export function listTier1ProfileIds() {

  return PROFILES.filter((p) => PROFILE_META[p.id]?.strictProfile).map((p) => p.id);

}



/**

 * @param {string} profileId

 * @returns {boolean}

 */

export function isTier1CodeProfile(profileId) {

  return Boolean(PROFILE_META[profileId]?.strictProfile);

}

export { getProfileLayoutHooks } from './layoutPipeline/profileLayoutHooks.js';

export { getReconciliationSpec, roleForLineKey } from './reconciliationSpec.js';



export default { resolveProfile, listProfiles, listTier1ProfileIds, isTier1CodeProfile, getProfileMeta, PROFILES, PROFILE_META };

