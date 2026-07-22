/**

 * DocumentMap contract — shared spine for layout-first two-pass pipeline.

 */



export const ANCHOR_STATUSES = Object.freeze({

  FOUND: 'found',

  MISSING: 'missing',

  PARTIAL: 'partial',

  RECOVERED: 'recovered'

});



export const REGION_TYPES = Object.freeze({

  SUMMARY: 'summary',

  TRANSACTION_HISTORY: 'transactionHistory',

  FEE_LEDGER: 'fee_ledger',

  IDENTITY: 'identity'

});



export const FINANCIAL_REGION_TYPES = Object.freeze({ ...REGION_TYPES });



export const IGNORED_REGION_TYPES = Object.freeze({

  AD: 'ad',

  FAQ: 'faq',

  BLANK_PAGE: 'blank_page',

  DISCLOSURE: 'disclosure',

  UNCLASSIFIED: 'unclassified'

});



export const BLOCK_ROLES = Object.freeze({

  FINANCIAL: 'financial',

  IGNORED: 'ignored'

});



/**

 * @returns {import('./documentMapContract.js').IdentityMap}

 */

export function createEmptyIdentityMap() {

  return {

    legalName: null,

    dba: null,

    ein: null,

    address: null,

    anchorStatus: ANCHOR_STATUSES.MISSING

  };

}



/**

 * @param {object} raw

 * @returns {import('./documentMapContract.js').IdentityMap}

 */

export function normalizeIdentityMap(raw = {}) {

  const hasAny =

    raw.legalName || raw.dba || raw.ein || raw.address;

  return {

    legalName: raw.legalName ?? null,

    dba: raw.dba ?? null,

    ein: raw.ein ?? null,

    address: raw.address ?? null,

    anchorStatus:

      raw.anchorStatus ??

      (hasAny ? ANCHOR_STATUSES.FOUND : ANCHOR_STATUSES.MISSING)

  };

}



/**

 * @param {object} spec

 * @returns {object}

 */

export function normalizeRegionSpec(spec = {}) {

  return {

    type: spec.type || REGION_TYPES.TRANSACTION_HISTORY,

    text: typeof spec.text === 'string' ? spec.text : '',

    pageIndex: spec.pageIndex ?? null,

    bbox: spec.bbox ?? null,

    anchorStatus: spec.anchorStatus ?? ANCHOR_STATUSES.MISSING,

    startAnchor: spec.startAnchor ?? null,

    endAnchor: spec.endAnchor ?? null

  };

}



/**

 * @param {object} spec

 * @returns {object}

 */

export function normalizeTextBlock(spec = {}) {

  const role =

    spec.role === BLOCK_ROLES.IGNORED ? BLOCK_ROLES.IGNORED : BLOCK_ROLES.FINANCIAL;

  return {

    id: spec.id ?? null,

    regionType: spec.regionType ?? REGION_TYPES.TRANSACTION_HISTORY,

    role,

    text: typeof spec.text === 'string' ? spec.text : '',

    pageIndex: spec.pageIndex ?? null,

    bbox: spec.bbox ?? null,

    startOffset: spec.startOffset ?? null,

    endOffset: spec.endOffset ?? null,

    parentRegionKey: spec.parentRegionKey ?? null,

    classificationReason: spec.classificationReason ?? null

  };

}



/**

 * @param {object} spec

 * @returns {object}

 */

export function createIgnoredRegion(spec = {}) {

  const regionType =

    spec.regionType && Object.values(IGNORED_REGION_TYPES).includes(spec.regionType)

      ? spec.regionType

      : IGNORED_REGION_TYPES.UNCLASSIFIED;

  return {

    ...normalizeRegionSpec({ ...spec, type: regionType }),

    id: spec.id ?? null,

    regionType,

    classificationReason: spec.classificationReason ?? null

  };

}



/**

 * @param {object} params

 * @returns {object}

 */

export function createContextArchive(params = {}) {

  const ignoredRegions = Array.isArray(params.ignoredRegions)

    ? params.ignoredRegions

    : params.documentMap?.ignoredRegions ?? [];



  const coverage = params.coverage ?? params.documentMap?.coverage ?? {};

  const fingerprint =

    params.fingerprint ?? params.documentMap?.fingerprint ?? '';



  const entries = ignoredRegions.map((r, idx) => ({

    id: r.id ?? `ignored_${idx}`,

    regionType: r.regionType ?? r.type ?? IGNORED_REGION_TYPES.UNCLASSIFIED,

    pageIndex: r.pageIndex ?? null,

    excerpt: String(r.text ?? '').slice(0, 500),

    charCount: String(r.text ?? '').length,

    classificationReason: r.classificationReason ?? null

  }));



  const ignoredByType = {

    ad: 0,

    faq: 0,

    blank_page: 0,

    disclosure: 0,

    unclassified: 0

  };

  for (const e of entries) {

    const key = e.regionType in ignoredByType ? e.regionType : 'unclassified';

    ignoredByType[key] += 1;

  }



  const financialBlocks = coverage.financialBlocks ?? 0;

  const ignoredBlocks = coverage.ignoredBlocks ?? entries.length;

  const totalBlocks = coverage.totalBlocks ?? financialBlocks + ignoredBlocks;



  return {

    version: '1',

    fingerprint,

    entries,

    stats: {

      totalBlocks,

      financialBlocks,

      ignoredBlocks,

      ignoredByType

    }

  };

}



/**

 * @param {object} params

 * @returns {import('./documentMapContract.js').DocumentMap}

 */

export function createDocumentMap(params = {}) {

  const regions = params.regions ?? {};

  const blocks = Array.isArray(params.blocks)

    ? params.blocks.map((b) => normalizeTextBlock(b))

    : [];

  const ignoredRegions = Array.isArray(params.ignoredRegions)

    ? params.ignoredRegions.map((r) => createIgnoredRegion(r))

    : [];



  return {

    fingerprint: params.fingerprint ?? '',

    profileId: params.profileId ?? null,

    pageCount: params.pageCount ?? 0,

    recoveryEligible: params.recoveryEligible ?? false,

    identity: normalizeIdentityMap(params.identity),

    regions: {

      summary: normalizeRegionSpec({ ...regions.summary, type: REGION_TYPES.SUMMARY }),

      transactionHistory: normalizeRegionSpec({

        ...regions.transactionHistory,

        type: REGION_TYPES.TRANSACTION_HISTORY

      }),

      fee_ledger: normalizeRegionSpec({

        ...regions.fee_ledger,

        type: REGION_TYPES.FEE_LEDGER

      }),

      identity: normalizeRegionSpec({

        ...regions.identity,

        type: REGION_TYPES.IDENTITY

      })

    },

    blocks,

    ignoredRegions,

    coverage: params.coverage ?? {

      totalBlocks: blocks.length + ignoredRegions.length,

      financialBlocks: blocks.length,

      ignoredBlocks: ignoredRegions.length

    },

    anchors: params.anchors ?? {},

    mappingSource: params.mappingSource ?? 'heuristic',

    meta: params.meta ?? {}

  };

}



/**

 * @param {object} params

 * @returns {import('./documentMapContract.js').RawExtractionBundle}

 */

export function createRawExtractionBundle(params = {}) {

  const documentMap = params.documentMap ?? null;

  const contextArchive =

    params.contextArchive ??

    (documentMap?.ignoredRegions?.length

      ? createContextArchive({ documentMap, ignoredRegions: documentMap.ignoredRegions })

      : null);



  return {

    extractionMode: params.extractionMode ?? 'profile_strict',

    profileId: params.profileId ?? null,

    transactions: Array.isArray(params.transactions) ? params.transactions : [],

    feeTransactions: Array.isArray(params.feeTransactions) ? params.feeTransactions : [],

    normalizedTransactions: Array.isArray(params.normalizedTransactions)

      ? params.normalizedTransactions

      : [],

    meta: params.meta ?? {},

    sectionChunks: params.sectionChunks ?? {},

    stitcherPrinted: params.stitcherPrinted ?? null,

    documentMap,

    identityMap: normalizeIdentityMap(params.identityMap ?? documentMap?.identity),

    contextArchive

  };

}



/**

 * @param {object} documentMap

 * @returns {boolean}

 */

export function isRecoveryEligible(documentMap) {

  if (!documentMap) return false;

  if (documentMap.recoveryEligible === true) return true;

  const txn = documentMap.regions?.transactionHistory;

  return Boolean(txn?.text?.trim?.()?.length > 0);

}



export default {

  ANCHOR_STATUSES,

  REGION_TYPES,

  FINANCIAL_REGION_TYPES,

  IGNORED_REGION_TYPES,

  BLOCK_ROLES,

  createEmptyIdentityMap,

  normalizeIdentityMap,

  normalizeRegionSpec,

  normalizeTextBlock,

  createIgnoredRegion,

  createContextArchive,

  createDocumentMap,

  createRawExtractionBundle,

  isRecoveryEligible

};


