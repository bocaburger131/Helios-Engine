/**
 * Node bridge to scripts/ocr_extract.py (PyMuPDF + Tesseract scan extraction).
 */
import path from 'node:path';
import logger from '../../utils/logger.js';
import { resolveSidecarLayoutProfile } from './pdfPlumberService.js';
import { normalizePlumberJson } from './plumberRowNormalizer.js';
import {
  API_ROOT,
  parseStdoutJson,
  resolvePythonExecutable,
  runPythonChildProcess,
  runPythonScriptOnPdfBuffer
} from './pythonSidecarRunner.js';

const OCR_DEBUG_LINE_RE =
  /OCR_DEBUG\s+page=(\d+)\s+text_len=(\d+)\s+ocr_used=(\S+)\s+txn_rows=(\d+)/;

export function scanOcrEnabled() {
  const v = process.env.OCR_ENABLED;
  if (v === 'false' || v === '0') return false;
  return true;
}

function resolveScriptPath() {
  const override = String(process.env.OCR_SCRIPT || '').trim();
  if (override) {
    return path.isAbsolute(override) ? override : path.resolve(API_ROOT, override);
  }
  return path.join(API_ROOT, 'scripts', 'ocr_extract.py');
}

function ocrTimeoutMs() {
  const n = Number(process.env.OCR_TIMEOUT_MS);
  return Number.isFinite(n) && n > 0 ? n : 180_000;
}


/**
 * @param {string} stderr
 * @returns {Array<{ page: number, textLen: number, ocrUsed: boolean, txnRows: number }>}
 */
export function parseOcrDebugLines(stderr) {
  const lines = String(stderr || '').split(/\r?\n/);
  const out = [];
  for (const line of lines) {
    const m = line.match(OCR_DEBUG_LINE_RE);
    if (m) {
      out.push({
        page: Number(m[1]),
        textLen: Number(m[2]),
        ocrUsed: m[3] === 'True' || m[3] === 'true',
        txnRows: Number(m[4])
      });
    }
  }
  return out;
}

/**
 * @param {object} json
 * @param {{ defaultYear?: number }} [options]
 */
export function mapOcrJsonToParseResult(json, options = {}) {
  const defaultYear = options.defaultYear ?? new Date().getFullYear();
  const normalized = normalizePlumberJson(json, defaultYear);
  return {
    transactions: normalized.transactions,
    openingBalance: normalized.openingBalance,
    closingBalance: normalized.closingBalance,
    metadata: {
      ...(json?.metadata && typeof json.metadata === 'object' ? json.metadata : {}),
      extractionEngine: 'pymupdf-tesseract'
    }
  };
}

/** @type {typeof runPythonChildProcess | null} */
let runChildProcessImpl = null;

export function setRunChildProcessImpl(fn) {
  runChildProcessImpl = fn;
}

export function resetRunChildProcessImpl() {
  runChildProcessImpl = null;
}

function softFail(partial) {
  return {
    success: false,
    transactions: [],
    openingBalance: partial.openingBalance ?? null,
    closingBalance: partial.closingBalance ?? null,
    metadata: partial.metadata ?? {},
    error: partial.error ?? 'unknown'
  };
}

/**
 * @param {Buffer} pdfBuffer
 * @param {{ profileId?: string, layoutProfile?: string, fileName?: string, defaultYear?: number }} [options]
 */
export async function extractTransactionsFromPdfBuffer(pdfBuffer, options = {}) {
  if (!scanOcrEnabled()) {
    return softFail({ error: 'disabled' });
  }
  if (!pdfBuffer?.length) {
    return softFail({ error: 'empty_buffer' });
  }

  const started = Date.now();
  const fileName = options.fileName || 'statement.pdf';
  const layoutProfile = resolveSidecarLayoutProfile(options);
  const scriptPath = resolveScriptPath();

  logger.info('[SCAN_OCR] start', { fileName, layoutProfile });

  try {
    const rawResult = await runPythonScriptOnPdfBuffer(pdfBuffer, {
      scriptPath,
      scriptArgs: ['--layout-profile', layoutProfile],
      timeoutMs: ocrTimeoutMs(),
      tempPrefix: 'scan-ocr-',
      runner: runChildProcessImpl ?? runPythonChildProcess
    });
    const { stdout, stderr } = rawResult;

    const stderrDebug = parseOcrDebugLines(stderr);
    if (stderrDebug.length) {
      logger.info('[SCAN_OCR] stderr telemetry', { fileName, debugPages: stderrDebug });
    }

    const { json, parseError } = parseStdoutJson(stdout);
    if (!json) {
      logger.warn('[SCAN_OCR] invalid JSON from child', {
        fileName,
        parseError,
        stdoutSnippet: stdout.slice(0, 300)
      });
      return softFail({
        error: parseError || 'invalid_json',
        metadata: { stderrDebug }
      });
    }

    const mapped = mapOcrJsonToParseResult(json, options);
    const resultMeta = {
      ...mapped.metadata,
      stderrDebug,
      pageTelemetry: mapped.metadata.pageTelemetry ?? json.metadata?.pageTelemetry
    };

    logger.info('[SCAN_OCR] result', {
      fileName,
      txnCount: mapped.transactions.length,
      ocrPages: resultMeta.ocrPages,
      durationMs: Date.now() - started
    });

    if (mapped.transactions.length === 0) {
      return {
        success: false,
        transactions: [],
        openingBalance: mapped.openingBalance,
        closingBalance: mapped.closingBalance,
        metadata: resultMeta,
        error: 'zero_transactions'
      };
    }

    return {
      success: true,
      transactions: mapped.transactions,
      openingBalance: mapped.openingBalance,
      closingBalance: mapped.closingBalance,
      metadata: resultMeta
    };
  } catch (e) {
    logger.warn('[SCAN_OCR] fail', {
      fileName,
      error: e.message,
      durationMs: Date.now() - started
    });
    if (process.env.OCR_STRICT === 'true') {
      throw e;
    }
    return softFail({ error: e.message });
  }
}

export default {
  scanOcrEnabled,
  resolvePythonExecutable,
  setRunChildProcessImpl,
  resetRunChildProcessImpl,
  extractTransactionsFromPdfBuffer,
  mapOcrJsonToParseResult,
  parseOcrDebugLines
};
