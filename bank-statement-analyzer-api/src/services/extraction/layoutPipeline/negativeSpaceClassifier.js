/**

 * Negative-space mapping — classify non-financial text blocks (ads, FAQs, disclosures, blank pages).

 */



import { splitPages } from '../../statementStitcher.js';

import {

  BLOCK_ROLES,

  IGNORED_REGION_TYPES,

  REGION_TYPES,

  normalizeTextBlock,

  createIgnoredRegion

} from './documentMapContract.js';



const RE_PAGE_MARKER_ONLY = /^page\s+\d+\s+of\s+\d+\s*$/i;

const RE_BLANK = /^\s*$/;



const IGNORED_HEURISTICS = [

  {

    type: IGNORED_REGION_TYPES.BLANK_PAGE,

    reason: 'empty_or_page_marker_only',

    test: (text) => {

      const t = String(text || '').trim();

      if (!t) return true;
      return RE_PAGE_MARKER_ONLY.test(t);

    }

  },

  {

    type: IGNORED_REGION_TYPES.DISCLOSURE,

    reason: 'regulatory_disclosure',

    test: (text) =>

      /member\s+fdic|equal\s+housing|important\s+information|terms\s+and\s+conditions|\bdisclosure\b/i.test(

        text

      )

  },

  {

    type: IGNORED_REGION_TYPES.FAQ,

    reason: 'faq_content',

    test: (text) =>

      /frequently\s+asked|how\s+to\s+order\s+checks|\bquestions?\b/i.test(text)

  },

  {

    type: IGNORED_REGION_TYPES.AD,

    reason: 'promotional_content',

    test: (text) =>

      /\bwww\.|visit\s+us|call\s+1-800|learn\s+more|promotional|\.com\b/i.test(text)

  }

];



/**

 * @param {string} text

 * @returns {{ regionType: string, classificationReason: string }}

 */

export function classifyIgnoredBlock(text) {

  for (const h of IGNORED_HEURISTICS) {

    if (h.test(text)) {

      return { regionType: h.type, classificationReason: h.reason };

    }

  }

  return {

    regionType: IGNORED_REGION_TYPES.UNCLASSIFIED,

    classificationReason: 'non_financial_unclassified'

  };

}



/**

 * @param {string} pageText

 * @returns {string[]}

 */

export function splitPageIntoParagraphBlocks(pageText) {

  const raw = String(pageText || '');

  if (!raw.trim()) return [''];



  const parts = raw.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);

  if (parts.length === 0) return [raw.trim() || ''];



  const merged = [];

  let buf = '';

  for (const part of parts) {

    if (part.length < 30 && merged.length > 0) {

      merged[merged.length - 1] = `${merged[merged.length - 1]}\n\n${part}`;

    } else if (part.length < 30) {

      buf = buf ? `${buf}\n\n${part}` : part;

      if (buf.length >= 30) {

        merged.push(buf);

        buf = '';

      }

    } else {

      if (buf) {

        merged.push(buf);

        buf = '';

      }

      merged.push(part);

    }

  }

  if (buf) merged.push(buf);

  return merged.length ? merged : [raw.trim()];

}



/**

 * Collect pages from stitcher or splitPages fallback.

 * @param {object} params

 * @returns {Array<{ pageIndex: number, text: string }>}

 */

export function collectPages(params = {}) {

  const { text = '', stitcher = null } = params;

  const fromStitcher = [

    ...(stitcher?.typeA?.pages ?? []),

    ...(stitcher?.typeB?.pages ?? []),

    ...(stitcher?.typeC?.pages ?? [])

  ];

  if (fromStitcher.length > 0) {

    return fromStitcher.map((p) => ({

      pageIndex: (p.pageIndex ?? 1) - 1,

      text: p.text ?? ''

    }));

  }



  const pages = splitPages(text);

  return pages.map((p) => ({

    pageIndex: (p.pageIndex ?? 1) - 1,

    text: p.text ?? ''

  }));

}



/**

 * @param {string} blockText

 * @param {string} fullText

 * @param {object} financialRegions

 * @returns {boolean}

 */

export function overlapsFinancialRegion(blockText, fullText, financialRegions = {}) {

  const needle = String(blockText || '').trim().slice(0, 80);

  if (!needle || needle.length < 8) return false;



  for (const region of Object.values(financialRegions)) {

    const regionText = region?.text ?? '';

    if (!regionText) continue;

    if (regionText.includes(needle) || needle.includes(regionText.slice(0, 80))) {

      return true;

    }

  }



  const idx = fullText.indexOf(needle);

  if (idx < 0) return false;



  for (const region of Object.values(financialRegions)) {

    const regionText = region?.text ?? '';

    if (!regionText) continue;

    const start = fullText.indexOf(regionText.slice(0, Math.min(40, regionText.length)));

    if (start < 0) continue;

    const end = start + regionText.length;

    if (idx >= start && idx <= end) return true;

  }

  return false;

}



/**

 * @param {object} financialRegions

 * @returns {object[]}

 */

export function buildFinancialBlocks(financialRegions = {}) {

  const keyToType = {

    summary: REGION_TYPES.SUMMARY,

    transactionHistory: REGION_TYPES.TRANSACTION_HISTORY,

    fee_ledger: REGION_TYPES.FEE_LEDGER,

    identity: REGION_TYPES.IDENTITY

  };



  const blocks = [];

  for (const [key, regionType] of Object.entries(keyToType)) {

    const region = financialRegions[key];

    if (!region?.text?.trim()) continue;

    blocks.push(

      normalizeTextBlock({

        id: `financial_${key}`,

        regionType,

        role: BLOCK_ROLES.FINANCIAL,

        text: region.text,

        pageIndex: region.pageIndex ?? null,

        bbox: region.bbox ?? null,

        parentRegionKey: key,

        classificationReason: 'financial_anchor_slice'

      })

    );

  }

  return blocks;

}



/**

 * @param {object} params

 * @returns {{ blocks: object[], ignoredRegions: object[], coverage: object }}

 */

export function buildBlockInventory(params = {}) {

  const { text = '', stitcher = null, financialRegions = {} } = params;

  const fullText = String(text || '');

  const pages = collectPages({ text: fullText, stitcher });



  const financialBlocks = buildFinancialBlocks(financialRegions);

  const ignoredRegions = [];

  let ignoredIdx = 0;



  for (const page of pages) {

    const paragraphBlocks = splitPageIntoParagraphBlocks(page.text);

    for (const para of paragraphBlocks) {

      const trimmed = para.trim();

      if (!trimmed && paragraphBlocks.length > 1) continue;



      if (overlapsFinancialRegion(trimmed, fullText, financialRegions)) {

        continue;

      }



      const { regionType, classificationReason } = classifyIgnoredBlock(trimmed);

      ignoredRegions.push(

        createIgnoredRegion({

          id: `ignored_${ignoredIdx++}`,

          regionType,

          text: trimmed,

          pageIndex: page.pageIndex,

          classificationReason

        })

      );

    }

  }



  const blocks = [...financialBlocks];

  const coverage = {

    totalBlocks: blocks.length + ignoredRegions.length,

    financialBlocks: blocks.length,

    ignoredBlocks: ignoredRegions.length

  };



  return { blocks, ignoredRegions, coverage };

}



export default {

  classifyIgnoredBlock,

  splitPageIntoParagraphBlocks,

  collectPages,

  overlapsFinancialRegion,

  buildFinancialBlocks,

  buildBlockInventory

};


