/**
 * Pass 1 — build DocumentMap from stitched statement text.
 */

import { resolveProfile, getProfileMeta } from '../bankProfileRegistry.js';
import {
  ANCHOR_STATUSES,
  createDocumentMap,
  isRecoveryEligible
} from './documentMapContract.js';
import { parseIdentityFromHeader } from './identityParser.js';
import { buildBlockInventory } from './negativeSpaceClassifier.js';
import { splitPages } from '../../statementStitcher.js';
import { normalizeSpaces } from '../profiles/wellsFargoInitiateProfile.js';
import { getProfileLayoutHooks } from './profileLayoutHooks.js';

export const FEE_LEDGER_ANCHORS = [
  /service charge/i,
  /fee summary/i,
  /fees?\s+and\s+charges/i,
  /analysis of service charges/i
];

/**
 * Map text offset to page index using splitPages markers.
 * @param {string} text
 * @param {number|null} pageCount
 * @returns {function(string): number|null}
 */
function buildPageIndexResolver(text, pageCount) {
  const pages = splitPages(text);
  if (pages.length <= 1 && !pages[0]?.totalPages) {
    return () => (pageCount > 1 ? 0 : 0);
  }
  const offsets = pages.map((p, i) => ({
    pageIndex: (p.pageIndex ?? i + 1) - 1,
    start: text.indexOf(p.text.slice(0, 40))
  }));
  return (regionText) => {
    if (!regionText) return null;
    const idx = text.indexOf(String(regionText).slice(0, 40));
    if (idx < 0) return null;
    let resolved = offsets[0]?.pageIndex ?? 0;
    for (const o of offsets) {
      if (o.start >= 0 && o.start <= idx) resolved = o.pageIndex;
    }
    return resolved;
  };
}

/**
 * @param {string} text
 * @returns {string}
 */
export function buildFeeLedgerRegion(text) {
  const normalized = normalizeSpaces(text || '');
  const idx = normalized.search(
    /(?:service charge|fee summary|fees and charges|analysis of service charges)/i
  );
  if (idx < 0) return '';
  return normalized.slice(idx, idx + 2500);
}

/**
 * @param {string} text
 * @returns {string}
 */
export function buildIdentityRegion(text) {
  return String(text || '').slice(0, 3500);
}

/**
 * @param {object} params
 * @returns {string}
 */
export function buildLayoutFingerprint(params = {}) {
  const { layoutTemplate, profileId, pageCount } = params;
  if (layoutTemplate?.fingerprint) return String(layoutTemplate.fingerprint);
  if (layoutTemplate?.headerAnchors?.length) {
    const keys = layoutTemplate.headerAnchors.map((a) => a.key || a.label).join('|');
    return `template:${profileId}:${keys}:${pageCount ?? 0}`;
  }
  return `profile:${profileId ?? 'unknown'}::stitch:${pageCount ?? 0}`;
}

/**
 * Apply stored template header anchors to locate region text when possible.
 * @param {string} text
 * @param {object} layoutTemplate
 * @param {string} regionKey
 * @returns {string}
 */
function sliceRegionFromTemplateAnchors(text, layoutTemplate, regionKey) {
  const anchors = layoutTemplate?.headerAnchors;
  if (!Array.isArray(anchors) || !anchors.length) return '';
  const anchor = anchors.find(
    (a) =>
      String(a.region || a.key || '').toLowerCase() === regionKey.toLowerCase() ||
      String(a.key || '').toLowerCase().includes(regionKey.toLowerCase())
  );
  if (!anchor?.pattern) return '';
  try {
    const re = new RegExp(anchor.pattern, anchor.flags || 'i');
    const m = String(text || '').match(re);
    if (!m?.index && m?.index !== 0) return '';
    const start = m.index;
    const endAnchor = anchor.endPattern ? new RegExp(anchor.endPattern, 'i') : null;
    let end = Math.min(text.length, start + (anchor.maxLen ?? 12000));
    if (endAnchor) {
      const tail = text.slice(start + 1);
      const em = tail.match(endAnchor);
      if (em?.index != null) end = start + 1 + em.index;
    }
    return text.slice(start, end);
  } catch {
    return '';
  }
}

/**
 * @param {object} input
 * @returns {ReturnType<typeof createDocumentMap>}
 */
export function buildDocumentMap(input = {}) {
  const text = normalizeSpaces(input.text || '');
  const altText = input.altText ? normalizeSpaces(input.altText) : '';
  const combined = text || altText;

  const profile = resolveProfile({
    text: combined,
    rtn: input.rtn,
    bankName: input.bankName,
    profileId: input.profileId
  });

  const hooks = getProfileLayoutHooks(profile.id);
  const hasTemplate = Boolean(input.layoutTemplate?.headerAnchors?.length);

  let summaryText =
    sliceRegionFromTemplateAnchors(combined, input.layoutTemplate, 'summary') ||
    hooks.buildSummaryRegion(combined);
  if (!summaryText?.trim()) summaryText = combined.slice(0, 2000);

  let txnSection =
    sliceRegionFromTemplateAnchors(combined, input.layoutTemplate, 'transactionHistory') ||
    hooks.buildTransactionRegion(combined) ||
    hooks.buildTransactionRegion(altText) ||
    '';

  const mappingSource = hasTemplate
    ? txnSection && summaryText
      ? 'hybrid'
      : 'template_hint'
    : 'heuristic';

  const feeText = buildFeeLedgerRegion(combined);
  const identityText = buildIdentityRegion(combined);
  const identity = parseIdentityFromHeader(identityText);
  const resolvePage = buildPageIndexResolver(combined, input.pageCount ?? 0);

  const regions = {
    summary: {
      type: 'summary',
      text: summaryText,
      pageIndex: resolvePage(summaryText),
      anchorStatus: summaryText ? ANCHOR_STATUSES.FOUND : ANCHOR_STATUSES.MISSING
    },
    transactionHistory: {
      type: 'transactionHistory',
      text: txnSection,
      pageIndex: resolvePage(txnSection),
      anchorStatus: txnSection ? ANCHOR_STATUSES.FOUND : ANCHOR_STATUSES.MISSING
    },
    fee_ledger: {
      type: 'fee_ledger',
      text: feeText,
      pageIndex: resolvePage(feeText),
      anchorStatus: feeText ? ANCHOR_STATUSES.FOUND : ANCHOR_STATUSES.MISSING
    },
    identity: {
      type: 'identity',
      text: identityText,
      pageIndex: resolvePage(identityText),
      anchorStatus: identity.anchorStatus
    }
  };

  const { blocks, ignoredRegions, coverage } = buildBlockInventory({
    text: combined,
    stitcher: input.stitcher ?? null,
    financialRegions: regions
  });

  const documentMap = createDocumentMap({
    fingerprint: buildLayoutFingerprint({
      layoutTemplate: input.layoutTemplate,
      profileId: profile.id,
      pageCount: input.pageCount
    }),
    profileId: profile.id,
    pageCount: input.pageCount ?? 0,
    recoveryEligible: getProfileMeta(profile.id).recoveryEligible === true,
    identity,
    regions,
    blocks,
    ignoredRegions,
    coverage,
    mappingSource,
    meta: {
      bankName: input.bankName ?? null,
      rtn: input.rtn ?? null,
      confidence: profile.confidence ?? null
    }
  });

  documentMap.recoveryEligible = isRecoveryEligible(documentMap);
  return documentMap;
}

export { parseIdentityFromHeader };

export default {
  FEE_LEDGER_ANCHORS,
  buildFeeLedgerRegion,
  buildIdentityRegion,
  buildLayoutFingerprint,
  buildDocumentMap,
  parseIdentityFromHeader
};
