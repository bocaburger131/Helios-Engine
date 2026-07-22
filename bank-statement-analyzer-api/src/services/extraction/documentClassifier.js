/**
 * Cheap PDF preflight classifier. Drives allowed extraction engines.
 * Extends extractionModeRouter probes — no engine may skip this for PDFs.
 */
import pdfParse from 'pdf-parse';
import {
  EXTRACTION_MODES,
  resolveExtractionMode
} from './extractionModeRouter.js';
import logger from '../../utils/logger.js';

export const DOCUMENT_CLASSES = Object.freeze({
  NATIVE_TEXT: 'native_text',
  NATIVE_BROKEN_GEOMETRY: 'native_broken_geometry',
  SCANNED: 'scanned',
  ENCRYPTED: 'encrypted',
  MALFORMED: 'malformed',
  MIXED_MODE: 'mixed_mode',
  MISSING_STATEMENT_SIGNALS: 'missing_statement_signals',
  NATIVE_FILE: 'native_file'
});

const STATEMENT_SIGNAL_RES = [
  /beginning\s+balance/i,
  /ending\s+balance/i,
  /statement\s+period/i,
  /account\s+(number|summary)/i,
  /deposits?\s*(and|&)?\s*credits?/i,
  /withdrawals?\s*(and|&)?\s*debits?/i,
  /total\s+deposits/i,
  /total\s+withdrawals/i
];

const LOW_TEXT_CHARS_PER_PAGE = Number(process.env.PDF_LOW_TEXT_CHARS_PER_PAGE) || 120;
const MIXED_EMPTY_PAGE_RATIO = 0.35;

/**
 * @param {string} text
 * @returns {number}
 */
function countStatementSignals(text) {
  const t = String(text || '');
  return STATEMENT_SIGNAL_RES.reduce((n, re) => (re.test(t) ? n + 1 : n), 0);
}

/**
 * Allowed engines by document class (plan contract).
 * @param {string} documentClass
 * @returns {{ engines: string[], parallel: boolean, terminalStatus: string|null }}
 */
export function allowedEnginesForClass(documentClass) {
  switch (documentClass) {
    case DOCUMENT_CLASSES.NATIVE_TEXT:
      return { engines: ['plumber', 'text'], parallel: true, terminalStatus: null };
    case DOCUMENT_CLASSES.NATIVE_BROKEN_GEOMETRY:
      return { engines: ['text', 'marker'], parallel: false, terminalStatus: null };
    case DOCUMENT_CLASSES.SCANNED:
      return { engines: ['marker'], parallel: false, terminalStatus: null };
    case DOCUMENT_CLASSES.MIXED_MODE:
      return { engines: ['plumber', 'text', 'marker'], parallel: false, terminalStatus: null };
    case DOCUMENT_CLASSES.ENCRYPTED:
    case DOCUMENT_CLASSES.MALFORMED:
      return {
        engines: [],
        parallel: false,
        terminalStatus:
          documentClass === DOCUMENT_CLASSES.ENCRYPTED ? 'NEEDS_REUPLOAD' : 'CORRUPT_PDF'
      };
    case DOCUMENT_CLASSES.MISSING_STATEMENT_SIGNALS:
      return { engines: ['text'], parallel: false, terminalStatus: null };
    case DOCUMENT_CLASSES.NATIVE_FILE:
      return { engines: ['native'], parallel: false, terminalStatus: null };
    default:
      return { engines: ['plumber', 'text'], parallel: true, terminalStatus: null };
  }
}

/**
 * @param {Buffer} buffer
 * @returns {{ encrypted: boolean, malformed: boolean, headerOk: boolean }}
 */
function probePdfHeader(buffer) {
  if (!buffer || buffer.length < 5) {
    return { encrypted: false, malformed: true, headerOk: false };
  }
  const head = buffer.slice(0, Math.min(buffer.length, 1024)).toString('latin1');
  if (!head.startsWith('%PDF')) {
    return { encrypted: false, malformed: true, headerOk: false };
  }
  const encrypted = /\/Encrypt[\s\/]/i.test(head);
  return { encrypted, malformed: false, headerOk: true };
}

/**
 * Classify an uploaded document before any extractor runs.
 * @param {{ buffer: Buffer, fileName?: string, mimetype?: string }} input
 * @returns {Promise<object>}
 */
export async function classifyDocument({ buffer, fileName = '', mimetype = '' }) {
  const modeInfo = await resolveExtractionMode({ buffer, fileName, mimetype });

  if (modeInfo.extractionMode === EXTRACTION_MODES.NATIVE) {
    const route = allowedEnginesForClass(DOCUMENT_CLASSES.NATIVE_FILE);
    return {
      documentClass: DOCUMENT_CLASSES.NATIVE_FILE,
      extractionMode: modeInfo.extractionMode,
      nativeFormat: modeInfo.nativeFormat,
      reason: modeInfo.reason,
      ...route,
      textLength: 0,
      pageCount: 0,
      signalHits: 0
    };
  }

  const header = probePdfHeader(buffer);
  if (header.malformed && (mimetype === 'application/pdf' || /\.pdf$/i.test(fileName))) {
    const route = allowedEnginesForClass(DOCUMENT_CLASSES.MALFORMED);
    return {
      documentClass: DOCUMENT_CLASSES.MALFORMED,
      extractionMode: modeInfo.extractionMode,
      reason: 'bad_pdf_header',
      ...route,
      textLength: 0,
      pageCount: 0,
      signalHits: 0
    };
  }

  if (header.encrypted) {
    const route = allowedEnginesForClass(DOCUMENT_CLASSES.ENCRYPTED);
    return {
      documentClass: DOCUMENT_CLASSES.ENCRYPTED,
      extractionMode: modeInfo.extractionMode,
      reason: 'pdf_encrypt_dict',
      ...route,
      textLength: 0,
      pageCount: 0,
      signalHits: 0
    };
  }

  let text = '';
  let pageCount = 1;
  let textLength = 0;
  try {
    const data = await pdfParse(buffer);
    text = data?.text || '';
    textLength = text.trim().length;
    pageCount = Math.max(1, data?.numpages || 1);
  } catch (err) {
    const msg = String(err?.message || err);
    if (/password|encrypt/i.test(msg)) {
      const route = allowedEnginesForClass(DOCUMENT_CLASSES.ENCRYPTED);
      return {
        documentClass: DOCUMENT_CLASSES.ENCRYPTED,
        extractionMode: modeInfo.extractionMode,
        reason: 'pdf_parse_encrypt',
        ...route,
        textLength: 0,
        pageCount: 0,
        signalHits: 0
      };
    }
    const route = allowedEnginesForClass(DOCUMENT_CLASSES.MALFORMED);
    return {
      documentClass: DOCUMENT_CLASSES.MALFORMED,
      extractionMode: modeInfo.extractionMode,
      reason: 'pdf_parse_throw',
      ...route,
      textLength: 0,
      pageCount: 0,
      signalHits: 0
    };
  }

  const charsPerPage = textLength / pageCount;
  const signalHits = countStatementSignals(text);
  const pages = text.split(/\f/);
  const emptyPages = pages.filter((p) => p.trim().length < 40).length;
  const emptyRatio = pages.length > 1 ? emptyPages / pages.length : 0;

  let documentClass = DOCUMENT_CLASSES.NATIVE_TEXT;
  let reason = modeInfo.reason || 'pdf_text_ok';

  if (modeInfo.extractionMode === EXTRACTION_MODES.SCAN || charsPerPage < LOW_TEXT_CHARS_PER_PAGE) {
    documentClass = DOCUMENT_CLASSES.SCANNED;
    reason = 'low_pdf_text_density';
  } else if (emptyRatio >= MIXED_EMPTY_PAGE_RATIO && charsPerPage >= LOW_TEXT_CHARS_PER_PAGE) {
    documentClass = DOCUMENT_CLASSES.MIXED_MODE;
    reason = 'mixed_empty_page_ratio';
  } else if (signalHits < 2) {
    documentClass = DOCUMENT_CLASSES.MISSING_STATEMENT_SIGNALS;
    reason = 'few_statement_signals';
  }

  const route = allowedEnginesForClass(documentClass);
  logger.info('[DOCUMENT_CLASS]', {
    fileName,
    documentClass,
    reason,
    textLength,
    pageCount,
    signalHits,
    engines: route.engines
  });

  return {
    documentClass,
    extractionMode: modeInfo.extractionMode,
    nativeFormat: modeInfo.nativeFormat,
    reason,
    ...route,
    textLength,
    pageCount,
    signalHits,
    charsPerPage: Math.round(charsPerPage)
  };
}

/**
 * Mark geometry as broken after a failed plumber candidate (caller upgrades class).
 * @param {object} classification
 * @returns {object}
 */
export function markBrokenGeometry(classification) {
  const documentClass = DOCUMENT_CLASSES.NATIVE_BROKEN_GEOMETRY;
  const route = allowedEnginesForClass(documentClass);
  return {
    ...classification,
    documentClass,
    reason: 'plumber_geometry_failed',
    ...route
  };
}

export default {
  classifyDocument,
  allowedEnginesForClass,
  markBrokenGeometry,
  DOCUMENT_CLASSES
};
