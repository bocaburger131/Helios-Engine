/**
 * Tri-mode extraction routing: native | digital_pdf | scan.
 * Phase 1: PDF → digital_pdf vs scan (low text); native sniff for future parsers.
 */
import pdfParse from 'pdf-parse';
import logger from '../../utils/logger.js';

export const EXTRACTION_MODES = Object.freeze({
  NATIVE: 'native',
  DIGITAL_PDF: 'digital_pdf',
  SCAN: 'scan'
});

const NATIVE_EXT = new Set([
  'csv',
  'ofx',
  'qfx',
  'bai',
  'bai2',
  'sta',
  'mt940',
  'xml'
]);

const LOW_TEXT_CHARS_PER_PAGE = Number(process.env.PDF_LOW_TEXT_CHARS_PER_PAGE) || 120;

function extensionOf(fileName) {
  const m = String(fileName || '').match(/\.([a-z0-9]+)$/i);
  return m ? m[1].toLowerCase() : '';
}

function sniffNativeFormat(buffer, fileName, mimetype) {
  const ext = extensionOf(fileName);
  if (ext === 'csv' || mimetype === 'text/csv') return 'csv';
  const head = buffer ? buffer.slice(0, Math.min(buffer.length, 4096)).toString('utf8') : '';
  if (/OFXHEADER/i.test(head) || ext === 'ofx' || ext === 'qfx') return ext === 'qfx' ? 'qfx' : 'ofx';
  if (/:20:|:61:|:62F:/m.test(head) || ext === 'sta' || ext === 'mt940') return 'mt940';
  if (/<Document xmlns="urn:iso:std:iso:20022:tech:xsd:camt\./i.test(head)) return 'camt';
  if (/^01,|^88,|16,/.test(head) || ext === 'bai' || ext === 'bai2') return 'bai2';
  if (NATIVE_EXT.has(ext)) return ext;
  return null;
}

/**
 * @param {Buffer} buffer
 * @returns {Promise<{ mode: string, nativeFormat: string|null, textLength: number, pageCount: number }>}
 */
async function probePdfText(buffer) {
  try {
    const data = await pdfParse(buffer);
    const text = data?.text || '';
    const pageCount = Math.max(1, data?.numpages || 1);
    return { textLength: text.trim().length, pageCount };
  } catch {
    return { textLength: 0, pageCount: 1 };
  }
}

/**
 * Resolve extraction mode for an uploaded statement file.
 * @param {object} input
 * @param {Buffer} input.buffer
 * @param {string} [input.fileName]
 * @param {string} [input.mimetype]
 * @returns {Promise<{ extractionMode: string, nativeFormat: string|null, reason: string }>}
 */
export async function resolveExtractionMode({ buffer, fileName = '', mimetype = '' }) {
  const nativeFormat = sniffNativeFormat(buffer, fileName, mimetype);
  if (nativeFormat) {
    logger.info('[EXTRACTION_MODE]', {
      fileName,
      mode: EXTRACTION_MODES.NATIVE,
      nativeFormat
    });
    return {
      extractionMode: EXTRACTION_MODES.NATIVE,
      nativeFormat,
      reason: `native_sniff_${nativeFormat}`
    };
  }

  const isPdf = mimetype === 'application/pdf' || extensionOf(fileName) === 'pdf';
  const isImage = /^image\/(jpeg|png|webp)$/i.test(mimetype) || /\.(jpe?g|png)$/i.test(fileName);

  if (isImage) {
    return {
      extractionMode: EXTRACTION_MODES.SCAN,
      nativeFormat: null,
      reason: 'image_upload'
    };
  }

  if (!isPdf || !buffer) {
    return {
      extractionMode: EXTRACTION_MODES.DIGITAL_PDF,
      nativeFormat: null,
      reason: 'default'
    };
  }

  const { textLength, pageCount } = await probePdfText(buffer);
  const charsPerPage = textLength / pageCount;
  if (charsPerPage < LOW_TEXT_CHARS_PER_PAGE) {
    logger.info('[EXTRACTION_MODE]', {
      fileName,
      mode: EXTRACTION_MODES.SCAN,
      textLength,
      pageCount,
      charsPerPage: Math.round(charsPerPage)
    });
    return {
      extractionMode: EXTRACTION_MODES.SCAN,
      nativeFormat: null,
      reason: 'low_pdf_text_density'
    };
  }

  logger.info('[EXTRACTION_MODE]', {
    fileName,
    mode: EXTRACTION_MODES.DIGITAL_PDF,
    textLength,
    pageCount
  });
  return {
    extractionMode: EXTRACTION_MODES.DIGITAL_PDF,
    nativeFormat: null,
    reason: 'pdf_text_ok'
  };
}

export function isDigitalPdfMode(stmtOrMeta) {
  const mode =
    stmtOrMeta?.extractionMode ??
    stmtOrMeta?.parseResult?.metadata?.extractionMode ??
    EXTRACTION_MODES.DIGITAL_PDF;
  return mode === EXTRACTION_MODES.DIGITAL_PDF;
}

export default { resolveExtractionMode, isDigitalPdfMode, EXTRACTION_MODES };
