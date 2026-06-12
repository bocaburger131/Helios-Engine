/**

 * Bank statement extraction profile registry.

 */

import * as wellsInitiate from './profiles/wellsFargoInitiateProfile.js';

import * as chaseBusiness from './profiles/chaseBusinessCompleteProfile.js';

import * as genericDigital from './profiles/genericDigitalProfile.js';

import logger from '../../utils/logger.js';



const PROFILE_META = Object.freeze({

  [wellsInitiate.PROFILE_ID]: { strictProfile: true, blockLegacyFallback: true },

  [chaseBusiness.PROFILE_ID]: { strictProfile: true, blockLegacyFallback: true },

  [genericDigital.PROFILE_ID]: { strictProfile: false, blockLegacyFallback: false }

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

  return PROFILE_META[profileId] ?? { strictProfile: false, blockLegacyFallback: false };

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



export default { resolveProfile, listProfiles, getProfileMeta, PROFILES, PROFILE_META };

