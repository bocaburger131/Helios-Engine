/**
 * Pluggable parser adapters — shared ParseResult contract for digital + scan paths.
 */
import { EXTRACTION_MODES } from './extractionModeRouter.js';
import { extractTransactionsFromPdfBuffer as extractPlumber } from './pdfPlumberService.js';
import { extractTransactionsFromPdfBuffer as extractOcr } from './scanOcrService.js';

/** @typedef {object} ParseAdapterResult
 * @property {boolean} success
 * @property {Array<object>} transactions
 * @property {number|null} openingBalance
 * @property {number|null} closingBalance
 * @property {object} metadata
 * @property {string} [error]
 */

/** @typedef {object} ParserAdapter
 * @property {string} id
 * @property {(ctx: object) => boolean} supports
 * @property {(buffer: Buffer, meta: object) => Promise<ParseAdapterResult>} parse
 */

/** @type {ParserAdapter[]} */
const ADAPTERS = [
  {
    id: 'pymupdf-tesseract-ocr',
    supports(ctx) {
      return ctx.extractionMode === EXTRACTION_MODES.SCAN;
    },
    parse(buffer, meta) {
      return extractOcr(buffer, meta);
    }
  },
  {
    id: 'pdfplumber-spatial',
    supports(ctx) {
      return (
        ctx.extractionMode === EXTRACTION_MODES.DIGITAL_PDF &&
        (ctx.rescue === true || ctx.preferPlumber === true)
      );
    },
    parse(buffer, meta) {
      return extractPlumber(buffer, meta);
    }
  }
];

/**
 * @param {object} ctx
 * @param {string} [ctx.extractionMode]
 * @param {boolean} [ctx.rescue]
 * @param {boolean} [ctx.preferPlumber]
 * @returns {ParserAdapter|null}
 */
export function selectParserAdapter(ctx = {}) {
  return ADAPTERS.find((a) => a.supports(ctx)) ?? null;
}

/**
 * @param {object} ctx
 * @returns {ParserAdapter[]}
 */
export function listParserAdapters(ctx = {}) {
  return ADAPTERS.filter((a) => a.supports(ctx));
}

/**
 * @param {Buffer} buffer
 * @param {object} ctx
 * @param {object} meta
 * @returns {Promise<ParseAdapterResult|null>}
 */
export async function parseWithRegistry(buffer, ctx, meta = {}) {
  const adapter = selectParserAdapter(ctx);
  if (!adapter) return null;
  const result = await adapter.parse(buffer, meta);
  return {
    ...result,
    metadata: {
      ...(result.metadata || {}),
      parserId: adapter.id
    }
  };
}

export function registerParserAdapter(adapter) {
  if (!adapter?.id || typeof adapter.supports !== 'function' || typeof adapter.parse !== 'function') {
    throw new Error('Invalid parser adapter');
  }
  const idx = ADAPTERS.findIndex((a) => a.id === adapter.id);
  if (idx >= 0) {
    ADAPTERS[idx] = adapter;
  } else {
    ADAPTERS.push(adapter);
  }
}

export default {
  selectParserAdapter,
  listParserAdapters,
  parseWithRegistry,
  registerParserAdapter
};
