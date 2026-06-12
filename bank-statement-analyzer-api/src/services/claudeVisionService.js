/**
 * Claude (Anthropic) vision layout service — public API parity with
 * geminiVisionService.analyzeStatementLayout so VISION_PROVIDER can swap them.
 *
 * Layout teach ONLY. Deliberately exposes NO transaction-row extraction: the
 * Diagnostic AI Rescue pattern forbids brute-force row extraction on the
 * checksum rescue path.
 */

import { claudeAdapter } from './llm/adapters/claudeAdapter.js';
import { coerceLayoutMapping } from './geminiVisionService.js';
import logger from '../utils/logger.js';

export function resolveClaudeApiKey() {
  return String(process.env.ANTHROPIC_API_KEY || '').trim();
}

/**
 * Analyze a statement PDF and return a coerced layout mapping.
 * Mirrors geminiVisionService.analyzeStatementLayout(pdfBuffer, options).
 * @param {Buffer} pdfBuffer
 * @param {object} [options]
 * @returns {Promise<object>}
 */
export async function analyzeStatementLayout(pdfBuffer, options = {}) {
  if (!resolveClaudeApiKey()) {
    throw new Error('ANTHROPIC_API_KEY is not set');
  }
  logger.info('[CLAUDE_VISION] analyzeStatementLayout', {
    rtn: options.rtn || null,
    bankName: options.bankName || null
  });
  const layout = await claudeAdapter.learnTemplateLayout(pdfBuffer, options);
  return coerceLayoutMapping(layout) || layout;
}

export default { analyzeStatementLayout, resolveClaudeApiKey };
