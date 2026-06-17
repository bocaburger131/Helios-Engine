/**
 * Profile-specific layout region builders for Pass 1 document mapping.
 */
import {
  extractSummary,
  extractTransactionSection,
  normalizeSpaces
} from '../profiles/wellsFargoInitiateProfile.js';
import { buildRegionsSummaryMeta } from '../profiles/regionsBusinessCheckingProfile.js';

const TXN_ZONE_RE =
  /transaction\s+history|account\s+activity|deposits?\s*(?:&|and)\s*credits?|electronic\s+deposits?|checks?\s+cleared/i;

function sliceFromAnchor(text, anchorRe, maxLen = 15000) {
  const t = normalizeSpaces(String(text || ''));
  const idx = t.search(anchorRe);
  if (idx < 0) return '';
  return t.slice(idx, Math.min(t.length, idx + maxLen));
}

function buildGenericSummaryRegion(text) {
  const t = normalizeSpaces(String(text || ''));
  const idx = t.search(/\b(?:beginning|opening)\s+balance/i);
  if (idx >= 0) return t.slice(idx, Math.min(t.length, idx + 2500));
  return t.slice(0, 2000);
}

function buildGenericTransactionRegion(text) {
  const sliced = sliceFromAnchor(text, TXN_ZONE_RE);
  if (sliced) return sliced;
  const lines = String(text || '').split(/\r?\n/);
  const txnLines = lines.filter((l) => /\d{1,2}\/\d{1,2}/.test(l) && /\d[\d,]*\.\d{2}/.test(l));
  return txnLines.join('\n');
}

function buildRegionsSummaryRegion(text) {
  const t = normalizeSpaces(String(text || ''));
  if (buildRegionsSummaryMeta(t)) {
    const idx = t.search(/\bSUMMARY\b/i);
    if (idx >= 0) return t.slice(idx, Math.min(t.length, idx + 2500));
  }
  return buildGenericSummaryRegion(t);
}

function buildRegionsTransactionRegion(text) {
  return (
    sliceFromAnchor(text, TXN_ZONE_RE) ||
    sliceFromAnchor(text, /withdrawals?\s*(?:\/|and)\s*debits?/i) ||
    buildGenericTransactionRegion(text)
  );
}

function buildChaseSummaryRegion(text) {
  const summary = extractSummary(normalizeSpaces(String(text || '')));
  if (summary) {
    const idx = String(text).search(/deposits?\s+and\s+additions?|account\s+summary/i);
    if (idx >= 0) return normalizeSpaces(text).slice(idx, idx + 2500);
  }
  return buildGenericSummaryRegion(text);
}

function buildChaseTransactionRegion(text) {
  return extractTransactionSection(normalizeSpaces(String(text || ''))) || buildGenericTransactionRegion(text);
}

const HOOKS_BY_PROFILE = Object.freeze({
  wells_initiate_checking: {
    buildSummaryRegion: (text) => {
      const summary = extractSummary(normalizeSpaces(String(text || '')));
      if (summary) {
        const t = normalizeSpaces(String(text || ''));
        return t.slice(0, 2500);
      }
      return buildGenericSummaryRegion(text);
    },
    buildTransactionRegion: (text) =>
      extractTransactionSection(normalizeSpaces(String(text || ''))) ||
      buildGenericTransactionRegion(text)
  },
  chase_business_complete: {
    buildSummaryRegion: buildChaseSummaryRegion,
    buildTransactionRegion: buildChaseTransactionRegion
  },
  regions_business_checking: {
    buildSummaryRegion: buildRegionsSummaryRegion,
    buildTransactionRegion: buildRegionsTransactionRegion
  },
  generic_digital: {
    buildSummaryRegion: buildGenericSummaryRegion,
    buildTransactionRegion: buildGenericTransactionRegion
  }
});

/**
 * @param {string} profileId
 * @returns {{ buildSummaryRegion: (text: string) => string, buildTransactionRegion: (text: string) => string }}
 */
export function getProfileLayoutHooks(profileId) {
  return (
    HOOKS_BY_PROFILE[profileId] ?? HOOKS_BY_PROFILE.generic_digital
  );
}

export default { getProfileLayoutHooks, HOOKS_BY_PROFILE };
