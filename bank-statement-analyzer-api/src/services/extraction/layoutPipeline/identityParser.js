/**
 * Parse business identity anchors from statement header text.
 */

import { ANCHOR_STATUSES, normalizeIdentityMap } from './documentMapContract.js';

const INSTITUTION_BLEED_RE =
  /jpmorgan|chase\s+bank|wells\s+fargo|regions\s+bank|bank\s*,?\s*n\.?a\.?/i;

export function isInstitutionBleedName(name) {
  return INSTITUTION_BLEED_RE.test(String(name || '').trim());
}

export const IDENTITY_ANCHOR_PATTERNS = {
  legalName: [
    /(?:account\s+(?:holder|name)|business\s+name)[:\s]+(.+?)(?:\n|$)/i,
    /^([A-Z][A-Z0-9\s&.',-]{2,60}(?:LLC|INC|CORP|LTD|CO)\.?)/im
  ],
  dba: [
    /(?:dba|d\.?b\.?a\.?|doing business as)[:\s]+(.+?)(?:\n|$)/i
  ],
  ein: [
    /(?:ein|tax id|federal tax id)[:\s#]*(\d{2}-?\d{7})/i
  ],
  address: [
    /(\d{1,6}\s+[\w\s.'#-]+(?:street|st|avenue|ave|road|rd|blvd|drive|dr|lane|ln|way|court|ct)\.?[\s,]+[\w\s]+,?\s+[A-Z]{2}\s+\d{5}(?:-\d{4})?)/i
  ]
};

function firstMatch(text, patterns) {
  for (const re of patterns) {
    const m = text.match(re);
    if (m?.[1]) return m[1].trim().replace(/\s{2,}/g, ' ');
  }
  return null;
}

/**
 * @param {string} text
 * @returns {ReturnType<typeof normalizeIdentityMap>}
 */
export function parseIdentityFromHeader(text) {
  const src = String(text || '').slice(0, 4000);
  if (!src.trim()) {
    return normalizeIdentityMap({});
  }

  const legalNameRaw = firstMatch(src, IDENTITY_ANCHOR_PATTERNS.legalName);
  const legalName =
    legalNameRaw && isInstitutionBleedName(legalNameRaw) ? null : legalNameRaw;
  const dba = firstMatch(src, IDENTITY_ANCHOR_PATTERNS.dba);
  const einRaw = firstMatch(src, IDENTITY_ANCHOR_PATTERNS.ein);
  const ein = einRaw ? einRaw.replace(/\D/g, '').replace(/^(\d{2})(\d{7})$/, '$1-$2') : null;
  const address = firstMatch(src, IDENTITY_ANCHOR_PATTERNS.address);

  const partial = Boolean(legalName || dba || ein || address);
  return normalizeIdentityMap({
    legalName,
    dba,
    ein,
    address,
    anchorStatus: partial ? ANCHOR_STATUSES.FOUND : ANCHOR_STATUSES.MISSING
  });
}

export default { parseIdentityFromHeader, IDENTITY_ANCHOR_PATTERNS, isInstitutionBleedName };
