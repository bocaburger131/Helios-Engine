/**
 * Gemini-based statement layout learning for InstitutionalProfile templates.
 * Delegates multimodal vision to geminiVisionService (Helios "Teacher").
 * @license Copyright (c) 2025 Shift 4 Financial INC
 */

import {
  analyzeStatementLayout,
  extractFirstPagesPdfBuffer,
  MATH_PATTERNS,
  coerceLayoutMapping,
  extractJsonObject
} from './geminiVisionService.js';

/**
 * Call Gemini 1.5 Pro vision on the first pages of the PDF and return layout mapping JSON.
 * @param {Buffer} pdfBuffer
 * @param {string} routingNumber
 * @param {{ statementId?: string, jobId?: string }} [visionOptions] Optional ids for structured logs
 * @returns {Promise<object>} layout mapping
 */
export async function identifyTemplate(pdfBuffer, routingNumber, visionOptions = {}) {
  return analyzeStatementLayout(pdfBuffer, {
    rtn: routingNumber,
    ...visionOptions
  });
}

export { MATH_PATTERNS, coerceLayoutMapping, extractJsonObject, extractFirstPagesPdfBuffer };
