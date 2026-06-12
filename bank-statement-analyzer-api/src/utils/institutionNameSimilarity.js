/**
 * Fuzzy institution name matching (Jaro–Winkler) for same-RTN conflict triage.
 * @license Copyright (c) 2025 Shift 4 Financial INC
 */

import { normalizeInstitutionName } from './identityMethodRank.js';

/** Names at or above this Jaro–Winkler score are treated as a soft match (no hard conflict). */
export const INSTITUTION_NAME_SOFT_THRESHOLD = 0.85;

/**
 * When one canonical name’s tokens are all present in the other (e.g. “chase bank” vs “jpmorgan chase bank”),
 * Jaro–Winkler alone can be low; boost so obvious same-brand variants soft-match.
 * @param {string} a
 * @param {string} b
 * @returns {number} bonus in [0, 0.95] or 0
 */
function tokenSubsetBoost(a, b) {
  const na = normalizeInstitutionName(a);
  const nb = normalizeInstitutionName(b);
  if (!na || !nb) return 0;
  const tokensA = na.split(' ').filter((t) => t.length >= 3);
  const tokensB = nb.split(' ').filter((t) => t.length >= 3);
  if (tokensA.length < 2 && tokensB.length < 2) return 0;
  const shorter = tokensA.length <= tokensB.length ? tokensA : tokensB;
  const longerStr = tokensA.length <= tokensB.length ? nb : na;
  if (shorter.length < 2) return 0;
  const allFound = shorter.every((t) => longerStr.includes(t));
  return allFound ? 0.92 : 0;
}

/**
 * @param {string} s1
 * @param {string} s2
 * @returns {number} Jaro similarity in [0, 1]
 */
function jaro(s1, s2) {
  const a = String(s1);
  const b = String(s2);
  const len1 = a.length;
  const len2 = b.length;
  if (len1 === 0 && len2 === 0) return 1;
  if (len1 === 0 || len2 === 0) return 0;

  const matchDistance = Math.max(0, Math.floor(Math.max(len1, len2) / 2) - 1);
  const s1Matches = new Array(len1).fill(false);
  const s2Matches = new Array(len2).fill(false);
  let matches = 0;

  for (let i = 0; i < len1; i++) {
    const start = Math.max(0, i - matchDistance);
    const end = Math.min(i + matchDistance + 1, len2);
    for (let j = start; j < end; j++) {
      if (s2Matches[j] || a[i] !== b[j]) continue;
      s1Matches[i] = true;
      s2Matches[j] = true;
      matches += 1;
      break;
    }
  }

  if (matches === 0) return 0;

  let t = 0;
  let k = 0;
  for (let i = 0; i < len1; i++) {
    if (!s1Matches[i]) continue;
    while (!s2Matches[k]) k += 1;
    if (a[i] !== b[k]) t += 1;
    k += 1;
  }

  return (matches / len1 + matches / len2 + (matches - t / 2) / matches) / 3;
}

/**
 * Jaro–Winkler similarity on normalized names (case/space collapsed).
 * @param {string} a
 * @param {string} b
 * @returns {number} in [0, 1]
 */
export function jaroWinklerSimilarity(a, b) {
  const s1 = normalizeInstitutionName(a);
  const s2 = normalizeInstitutionName(b);
  if (s1 === s2) return 1;
  if (!s1 || !s2) return 0;

  const j = jaro(s1, s2);
  let prefix = 0;
  const maxP = 4;
  for (let i = 0; i < Math.min(maxP, s1.length, s2.length); i++) {
    if (s1[i] === s2[i]) prefix += 1;
    else break;
  }
  const p = 0.1;
  return j + prefix * p * (1 - j);
}

/**
 * @param {string} a
 * @param {string} b
 * @returns {{ tier: 'exact'|'soft'|'hard', score: number }}
 */
export function classifyInstitutionNamePair(a, b) {
  const s1 = normalizeInstitutionName(a);
  const s2 = normalizeInstitutionName(b);
  if (s1 === s2) return { tier: 'exact', score: 1 };
  const jw = jaroWinklerSimilarity(a, b);
  const boost = tokenSubsetBoost(a, b);
  const score = Math.max(jw, boost);
  if (score >= INSTITUTION_NAME_SOFT_THRESHOLD) return { tier: 'soft', score };
  return { tier: 'hard', score };
}
