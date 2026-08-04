import path from 'node:path';
import logger from '../../utils/logger.js';
import { normalizePlumberJson } from './plumberRowNormalizer.js';
import {
  API_ROOT,
  parseStdoutJson,
  resolvePythonExecutable,
  runPythonChildProcess,
  runPythonScriptOnPdfBuffer
} from './pythonSidecarRunner.js';

const DEBUG_LINE_RE =
  /PDFPLUMBER_DEBUG\s+page=(\d+)\s+raw_rows=(\d+)\s+strategy=(\S+)\s+tables=(\d+)/;

export function pdfPlumberEnabled() {
  const v = process.env.PDFPLUMBER_ENABLED;
  if (v === 'false' || v === '0') return false;
  return true;
}

export { resolvePythonExecutable, parseStdoutJson };

function resolveScriptPath() {
  const override = String(process.env.PDFPLUMBER_SCRIPT || '').trim();
  if (override) {
    return path.isAbsolute(override) ? override : path.resolve(API_ROOT, override);
  }
  return path.join(API_ROOT, 'scripts', 'extract_tables.py');
}

function plumberTimeoutMs() {
  const n = Number(process.env.PDFPLUMBER_TIMEOUT_MS);
  return Number.isFinite(n) && n > 0 ? n : 120_000;
}

function bankSlug(bankName) {
  const n = String(bankName || '').toLowerCase();
  if (/wells/.test(n)) return 'wells';
  if (/regions/.test(n)) return 'regions';
  if (/chase|jpmorgan/.test(n)) return 'chase';
  return 'generic';
}

/**
 * Normalize template explicitVerticalLines (x-coordinates of column breaks).
 * @param {unknown} raw
 * @returns {number[] | null} ascending unique x-coordinates, or null when empty/invalid
 */
export function normalizeExplicitVerticalLines(raw) {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const nums = raw.map(Number).filter((n) => Number.isFinite(n) && n >= 0);
  if (nums.length === 0) return null;
  return [...new Set(nums)].sort((a, b) => a - b);
}

/**
 * @param {string} stderr
 * @returns {Array<{ page: number, rawRows: number, strategy: string, tables: number }>}
 */
export function parseDebugLines(stderr) {
  const lines = String(stderr || '').split(/\r?\n/);
  const out = [];
  for (const line of lines) {
    const m = line.match(DEBUG_LINE_RE);
    if (m) {
      out.push({
        page: Number(m[1]),
        rawRows: Number(m[2]),
        strategy: m[3],
        tables: Number(m[4])
      });
    }
  }
  return out;
}

/**
 * @param {string} stderr
 * @param {string} [fileName]
 */
export function logPlumberStderrTelemetry(stderr, fileName) {
  const parsed = parseDebugLines(stderr);
  if (parsed.length === 0 && !stderr?.trim()) return;
  logger.info('[PDF_PLUMBER] stderr telemetry', {
    fileName: fileName ?? null,
    debugPages: parsed,
    stderrLines: String(stderr || '')
      .split(/\r?\n/)
      .filter((l) => l.includes('PDFPLUMBER_DEBUG') || l.trim().length > 0)
      .slice(0, 20)
  });
}

/**
 * @param {string} stdout
 * @returns {{ json: object|null, parseError: string|null }}
 */
export function parsePlumberStdoutJson(stdout) {
  const trimmed = String(stdout || '').trim();
  if (trimmed.includes('File "extract_tables.py"')) {
    return { json: null, parseError: 'python_traceback_in_stdout' };
  }
  return parseStdoutJson(stdout);
}

/**
 * @param {object} json
 * @param {{ defaultYear?: number }} [options]
 */
export function mapPlumberJsonToParseResult(json, options = {}) {
  const defaultYear = options.defaultYear ?? new Date().getFullYear();
  const normalized = normalizePlumberJson(json, defaultYear);
  const transactions = normalized.transactions;
  return {
    transactions,
    openingBalance: normalized.openingBalance,
    closingBalance: normalized.closingBalance,
    // Evidence sidecar for AI rescue — must survive the pipe into the pipeline
    droppedRows: normalized.droppedRows || [],
    uncertainAssignments: normalized.uncertainAssignments || [],
    rawWordRows: normalized.rawWordRows || [],
    metadata: {
      ...(json?.metadata && typeof json.metadata === 'object' ? json.metadata : {}),
      extractionEngine: 'pdfplumber',
      droppedRowCount: (normalized.droppedRows || []).length,
      uncertainAssignmentCount: (normalized.uncertainAssignments || []).length,
      rawWordRowCount: (normalized.rawWordRows || []).length,
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

/** @deprecated use runPythonChildProcess from pythonSidecarRunner */
export const runPlumberChildProcess = runPythonChildProcess;

/**
 * @param {Buffer} pdfBuffer
 * @param {{ bankName?: string, fileName?: string, defaultYear?: number }} [options]
 */
export async function extractTransactionsFromPdfBuffer(pdfBuffer, options = {}) {
  if (!pdfPlumberEnabled()) {
    return softFail({ error: 'disabled' });
  }
  if (!pdfBuffer?.length) {
    return softFail({ error: 'empty_buffer' });
  }

  const started = Date.now();
  const fileName = options.fileName || 'statement.pdf';
  const scriptPath = resolveScriptPath();
  const slug = bankSlug(options.bankName);

  const scriptArgs = ['--bank', slug];
    if (options.__columnTolerance != null) {
      scriptArgs.push('--column-tolerance', String(options.__columnTolerance));
    }
    // Template-learned column breaks → pdfplumber explicit vertical strategy.
    const explicitLines = normalizeExplicitVerticalLines(options.explicitVerticalLines);
    if (explicitLines) {
      scriptArgs.push('--explicit-vertical-lines', JSON.stringify(explicitLines));
    }

    logger.info('[PDF_PLUMBER] start', {
      fileName,
      bank: slug,
      explicitVerticalLines: explicitLines ?? null
    });

  try {
    const { stdout, stderr } = await runPythonScriptOnPdfBuffer(pdfBuffer, {
      scriptPath,
      scriptArgs,
      timeoutMs: plumberTimeoutMs(),
      tempPrefix: 'pdfplumber-',
      runner: runChildProcessImpl ?? runPythonChildProcess
    });

    logPlumberStderrTelemetry(stderr, fileName);

    const { json, parseError } = parsePlumberStdoutJson(stdout);
    if (!json) {
      logger.warn('[PDF_PLUMBER] invalid JSON from child', {
        fileName,
        parseError,
        stdoutSnippet: stdout.slice(0, 300),
        stderrSnippet: stderr.slice(0, 500)
      });
      return softFail({
        error: parseError || 'invalid_json',
        metadata: { stderrDebug: parseDebugLines(stderr) }
      });
    }

    const mapped = mapPlumberJsonToParseResult(json, options);
    const stderrDebug = parseDebugLines(stderr);

    const resultMeta = {
      ...mapped.metadata,
      stderrDebug,
      pageTelemetry: mapped.metadata.pageTelemetry ?? json.metadata?.pageTelemetry,
      extractionStrategy: mapped.metadata.extractionStrategy ?? json.metadata?.extractionStrategy
    };

    logger.info('[PDF_PLUMBER] result', {
      fileName,
      txnCount: mapped.transactions.length,
      tablesExtracted: resultMeta.tablesExtracted,
      pageTelemetry: resultMeta.pageTelemetry,
      extractionStrategy: resultMeta.extractionStrategy,
      stderrDebug,
      durationMs: Date.now() - started
    });

    if (mapped.transactions.length === 0) {
      return {
        success: false,
        transactions: [],
        openingBalance: mapped.openingBalance,
        closingBalance: mapped.closingBalance,
        droppedRows: mapped.droppedRows || [],
        uncertainAssignments: mapped.uncertainAssignments || [],
        rawWordRows: mapped.rawWordRows || [],
        metadata: resultMeta,
        error: 'zero_transactions'
      };
    }

    logger.info('[PDF_PLUMBER] success', {
      fileName,
      txnCount: mapped.transactions.length,
      droppedRows: mapped.droppedRows?.length || 0,
      uncertainAssignments: mapped.uncertainAssignments?.length || 0,
      durationMs: Date.now() - started
    });

    return {
      success: true,
      transactions: mapped.transactions,
      openingBalance: mapped.openingBalance,
      closingBalance: mapped.closingBalance,
      droppedRows: mapped.droppedRows || [],
      uncertainAssignments: mapped.uncertainAssignments || [],
      rawWordRows: mapped.rawWordRows || [],
      metadata: resultMeta
    };
  } catch (e) {
    logger.warn('[PDF_PLUMBER] fail', {
      fileName,
      error: e.message,
      durationMs: Date.now() - started
    });
    if (process.env.PDFPLUMBER_STRICT === 'true') {
      throw e;
    }
    return softFail({ error: e.message });
  }
}

function softFail(partial) {
  return {
    success: false,
    transactions: [],
    openingBalance: partial.openingBalance ?? null,
    closingBalance: partial.closingBalance ?? null,
    rawWordRows: partial.rawWordRows ?? [],
    metadata: partial.metadata ?? {},
    error: partial.error ?? 'unknown'
  };
}

export default {
  pdfPlumberEnabled,
  resolvePythonExecutable,
  runPlumberChildProcess,
  setRunChildProcessImpl,
  resetRunChildProcessImpl,
  extractTransactionsFromPdfBuffer,
  mapPlumberJsonToParseResult,
  parsePlumberStdoutJson,
  parseStdoutJson,
  parseDebugLines,
  logPlumberStderrTelemetry
};
