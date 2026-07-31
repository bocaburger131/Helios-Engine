/**
 * Mistral OCR Provider — Helios AI.Vision provider using Mistral OCR.
 *
 * Mistral OCR is purpose-built for document OCR, not a general vision model.
 * It sends a PDF (URL or base64 buffer) and returns structured markdown with
 * text + embedded images. The output is then adapted to match the standard
 * Helios layout mapping interface.
 *
 * API: https://api.mistral.ai/v1/ocr
 * Docs: https://docs.mistral.ai/capabilities/document/
 *
 * The @mistralai/mistralai SDK is not installed — this provider uses direct
 * fetch to the Mistral REST API.
 *
 * Enable: set MISTRAL_API_KEY in your environment, then AI_VISION_PROVIDER=mistral.
 *
 * @license Copyright (c) 2025 Shift 4 Financial INC
 */

import {
  extractFirstPagesPdfBuffer,
  coerceLayoutMapping
} from './geminiVisionProvider.js';
import { logStructured } from '../../utils/structuredLog.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MISTRAL_OCR_URL = 'https://api.mistral.ai/v1/ocr';

// ---------------------------------------------------------------------------
// API interaction
// ---------------------------------------------------------------------------

/**
 * Resolve the Mistral API key from environment.
 * @returns {string}
 */
function resolveMistralApiKey() {
  return String(process.env.MISTRAL_API_KEY || '').trim();
}

/**
 * Call the Mistral OCR REST API with a PDF buffer.
 *
 * Mistral OCR accepts either:
 *   - A publicly accessible document_url
 *   - A base64-encoded document (inline)
 *
 * We use the base64 inline approach since Helios holds the PDF in memory.
 *
 * @param {Buffer} pdfBuffer - the PDF to OCR
 * @param {{ includeImageBase64?: boolean }} [opts]
 * @returns {Promise<object>} Mistral OCR response with pages[].markdown
 */
async function callMistralOcr(pdfBuffer, opts = {}) {
  const apiKey = resolveMistralApiKey();
  if (!apiKey) {
    throw new Error(
      'Mistral OCR provider: MISTRAL_API_KEY is not set. ' +
      'Get a key at https://console.mistral.ai/ and set it in your environment.'
    );
  }

  const body = {
    model: 'mistral-ocr-latest',
    document: {
      type: 'document_url',
      document_url: `data:application/pdf;base64,${pdfBuffer.toString('base64')}`
    },
    include_image_base64: opts.includeImageBase64 ?? false
  };

  const response = await fetch(MISTRAL_OCR_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => 'unknown');
    throw new Error(
      `Mistral OCR API error ${response.status}: ${errorText.slice(0, 500)}`
    );
  }

  return response.json();
}

// ---------------------------------------------------------------------------
// Output adaptation
// ---------------------------------------------------------------------------

/**
 * Convert Mistral OCR structured markdown output into a Helios layout mapping.
 *
 * Mistral returns structured markdown per page with text blocks and embedded
 * image references. We extract the concatenated text and build a minimal
 * layout mapping. Mistral OCR does not infer column structure — it provides
 * raw text that Helios can feed into its digital-first parsers.
 *
 * @param {object} mistralResponse - full Mistral OCR API response
 * @param {object} [options]
 * @returns {object} coerced layout mapping with _mistralMarkdown attached
 */
function buildLayoutFromMistralResponse(mistralResponse, options = {}) {
  const pages = Array.isArray(mistralResponse.pages) ? mistralResponse.pages : [];

  // Concatenate markdown from all pages
  const fullMarkdown = pages
    .map((page) => {
      const md = String(page.markdown || '');
      return md;
    })
    .join('\n\n');

  // Extract any text blocks from the structured response
  const allTextBlocks = [];
  for (const page of pages) {
    if (Array.isArray(page.blocks)) {
      for (const block of page.blocks) {
        if (block.text && typeof block.text === 'string') {
          allTextBlocks.push(block.text.trim());
        }
      }
    }
  }
  const concatenatedText = allTextBlocks.join('\n');

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
    confidence: 0.35, // moderate — Mistral OCR extracts text well but no column structure
    balanceReconciliationHint: '',
    _mistralMarkdown: fullMarkdown,
    _mistralText: concatenatedText || fullMarkdown
  };

  const core = coerceLayoutMapping(raw);
  const result = { ...core, layoutConfidence: 0.35, _provider: 'mistral-ocr', _mistralMarkdown: fullMarkdown, _mistralPageCount: pages.length };
  return result;
}

// ---------------------------------------------------------------------------
// Main analyze function
// ---------------------------------------------------------------------------

/**
 * Analyze a bank statement PDF using Mistral OCR.
 *
 * Mistral OCR is specialized for documents — it returns structured markdown
 * per page. Helios can feed this extracted text into its digital-first parsers
 * (pdfplumber, section detection) for final column-level extraction.
 *
 * @param {Buffer} pdfBuffer
 * @param {{ rtn?: string, statementId?: string, jobId?: string, bankName?: string }} [options]
 * @returns {Promise<object>} layout mapping with _mistralMarkdown attached
 */
async function analyzeStatementLayout(pdfBuffer, options = {}) {
  const apiKey = resolveMistralApiKey();
  if (!apiKey) {
    throw new Error(
      'Mistral OCR provider: MISTRAL_API_KEY is not set. ' +
      'Get a key at https://console.mistral.ai/ and set it in your environment, ' +
      'or switch to AI_VISION_PROVIDOR=gemini.'
    );
  }

  const rtn = String(options.rtn || '').replace(/\D/g, '');
  const logBase = {
    domain: 'mistral-ocr',
    rtn: rtn || null,
    bankName: options.bankName || null,
    statementId: options.statementId || null,
    jobId: options.jobId || null
  };

  logStructured('info', '[MISTRAL_OCR_START] Sending PDF for OCR analysis', {
    ...logBase,
    pdfBytes: pdfBuffer.length
  });

  // Mistral OCR can handle full documents, but we pass the pdf directly
  let mistralResponse;
  try {
    mistralResponse = await callMistralOcr(pdfBuffer);
  } catch (e) {
    logStructured('warn', '[MISTRAL_OCR_FAILURE] API call failed', {
      ...logBase,
      error: e.message
    });
    throw e;
  }

  const pages = Array.isArray(mistralResponse.pages) ? mistralResponse.pages : [];
  const totalChars = pages.reduce(
    (sum, p) => sum + (String(p.markdown || '').length),
    0
  );

  if (totalChars < 50) {
    logStructured('warn', '[MISTRAL_OCR_FAILURE] Insufficient text extracted', {
      ...logBase,
      pageCount: pages.length,
      totalChars
    });
    throw new Error(
      'Mistral OCR returned insufficient text content. ' +
      'The PDF may be a scanned image at low resolution.'
    );
  }

  const layout = buildLayoutFromMistralResponse(mistralResponse, options);

  logStructured('info', '[MISTRAL_OCR_SUCCESS] Layout built from OCR output', {
    ...logBase,
    pageCount: pages.length,
    totalChars,
    layoutConfidence: layout.layoutConfidence
  });

  return layout;
}

// ---------------------------------------------------------------------------
// Provider object
// ---------------------------------------------------------------------------

export const mistralOcrProvider = {
  name: 'mistral',
  analyzeStatementLayout,
  extractFirstPagesPdfBuffer,
  supportsSectionalAnalysis: false, // returns the entire document at once
  maxContextPages: 50
};

export default mistralOcrProvider;
