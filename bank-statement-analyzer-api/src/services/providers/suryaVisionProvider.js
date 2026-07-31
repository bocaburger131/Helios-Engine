/**
 * Surya Vision Provider — Helios AI.Vision provider using Surya VLM.
 *
 * Surya is a lightweight OCR/layout VLM that runs locally via a Python
 * subprocess. No API key is needed and no data leaves the server.
 *
 * Prerequisites:
 *   pip install surya-ocr
 *   surya download   # download models (~2 GB, GPU recommended)
 *
 * Enable: set SURYA_ENABLED=true in your environment.
 *
 * Key advantage: Zero API cost, runs locally, fully private.
 *
 * @license Copyright (c) 2025 Shift 4 Financial INC
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { writeFile, mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  extractFirstPagesPdfBuffer,
  coerceLayoutMapping,
  extractJsonObject
} from './geminiVisionProvider.js';

const execFileAsync = promisify(execFile);

// ---------------------------------------------------------------------------
// Availability checks
// ---------------------------------------------------------------------------

let _suryaAvailable = null; // cached result of the env + Python check

/**
 * Check if Surya is enabled and installed.
 * Results are cached after first call to avoid repeated subprocess spawns.
 * @returns {Promise<boolean>}
 */
async function isSuryaAvailable() {
  if (_suryaAvailable !== null) return _suryaAvailable;

  const enabled = String(process.env.SURYA_ENABLED || '').trim().toLowerCase() === 'true';
  if (!enabled) {
    _suryaAvailable = false;
    return false;
  }

  try {
    await execFileAsync('python3', ['-c', 'import surya']);
    _suryaAvailable = true;
    return true;
  } catch {
    _suryaAvailable = false;
    return false;
  }
}

/**
 * Throw a clear actionable error when Surya is not available.
 */
function suryaNotAvailableError() {
  const enabled = String(process.env.SURYA_ENABLED || '').trim().toLowerCase();
  if (enabled !== 'true') {
    throw new Error(
      'Surya vision provider: SURYA_ENABLED is not set to "true".\n' +
      'To enable Surya (local, free OCR):\n' +
      '  1. pip install surya-ocr\n' +
      '  2. surya download\n' +
      '  3. export SURYA_ENABLED=true\n' +
      'Or switch back to AI_VISION_PROVIDOR=gemini.'
    );
  }
  throw new Error(
    'Surya vision provider: the `surya` Python package is not installed.\n' +
    'Install it with: pip install surya-ocr\n' +
    'Then download models: surya download\n' +
    'Or switch back to AI_VISION_PROVIDOR=gemini.'
  );
}

// ---------------------------------------------------------------------------
// Surya OCR execution
// ---------------------------------------------------------------------------

/**
 * Run surya_ocr CLI on a PDF file and return the extracted text.
 * @param {string} pdfPath - path to the PDF file on disk
 * @returns {Promise<string>} extracted text (markdown or plain)
 */
async function runSuryaOcr(pdfPath) {
  const args = [pdfPath, '--output-format', 'markdown'];
  try {
    const { stdout } = await execFileAsync('surya_ocr', args, {
      timeout: 300_000, // 5 minutes
      maxBuffer: 50 * 1024 * 1024 // 50 MB
    });
    return stdout;
  } catch (err) {
    // Fall back to python -m surya if CLI not on PATH
    if (err.code === 'ENOENT') {
      const { stdout } = await execFileAsync('python3', ['-m', 'surya_ocr', ...args], {
        timeout: 300_000,
        maxBuffer: 50 * 1024 * 1024
      });
      return stdout;
    }
    throw err;
  }
}

/**
 * Build a minimal layout mapping from Surya's OCR text output.
 * Surya does full-page OCR — it doesn't understand transaction columns.
 * We return a basic mapping that signals to Helios that text was extracted
 * but column-level structure could not be determined automatically.
 *
 * @param {string} ocrText - raw extracted text from Surya
 * @param {object} [options]
 * @returns {object} coerced layout mapping
 */
function buildLayoutFromSuryaText(ocrText, options = {}) {
  const raw = {
    headerAnchors: { tableStart: '', tableEnd: '' },
    columnMapping: {
      dateCol: 0,
      descCol: 1,
      amountCol: 2,
      balanceCol: null,
      debitCol: null,
      creditCol: null
    },
    mathPattern: 'MINUS_PREFIX',
    confidence: 0.30, // low confidence — Surya can't infer layout structure
    balanceReconciliationHint: '',
    _suryaOcrText: ocrText // attach raw OCR text for downstream processing
  };

  const core = coerceLayoutMapping(raw);
  return {
    ...core,
    layoutConfidence: 0.30,
    _provider: 'surya',
    _suryaOcrText: ocrText
  };
}

// ---------------------------------------------------------------------------
// Main analyze function
// ---------------------------------------------------------------------------

/**
 * Analyze a bank statement PDF using Surya (local OCR).
 *
 * Surya performs full-page OCR only — it does not do section-scoped analysis
 * or column-level inference. The output provides text extraction with a low
 * confidence flag so Helios can fall through to digital-first heuristics.
 *
 * @param {Buffer} pdfBuffer
 * @param {object} [options]
 * @returns {Promise<object>} layout mapping with low confidence and _suryaOcrText
 */
async function analyzeStatementLayout(pdfBuffer, options = {}) {
  const available = await isSuryaAvailable();
  if (!available) {
    suryaNotAvailableError();
  }

  // Write PDF buffer to a temp file (surya_ocr requires a file path)
  const tmpDir = await mkdtemp(join(tmpdir(), 'helios-surya-'));
  const pdfPath = join(tmpDir, 'statement.pdf');

  try {
    await writeFile(pdfPath, pdfBuffer);

    const ocrText = await runSuryaOcr(pdfPath);

    if (!ocrText || ocrText.trim().length < 50) {
      throw new Error(
        'Surya OCR returned insufficient text content. ' +
        'The PDF may be image-only with poor resolution.'
      );
    }

    return buildLayoutFromSuryaText(ocrText, options);
  } finally {
    // Clean up temp files
    try { await rm(tmpDir, { recursive: true, force: true }); } catch { /* best effort */ }
  }
}

// ---------------------------------------------------------------------------
// Provider object
// ---------------------------------------------------------------------------

export const suryaVisionProvider = {
  name: 'surya',

  analyzeStatementLayout,

  extractFirstPagesPdfBuffer,

  // Surya does full-page OCR, not section-scoped analysis
  supportsSectionalAnalysis: false,

  // Surya handles many pages efficiently (local processing)
  maxContextPages: 50
};

export default suryaVisionProvider;
