/**
 * ACTIVE_LLM orchestrator — hot-swappable layout teach + row extraction.
 */

import { geminiAdapter, rowFallbackEnabled as geminiRowFallback } from './adapters/geminiAdapter.js';
import { claudeAdapter } from './adapters/claudeAdapter.js';
import { perplexityAdapter } from './adapters/perplexityAdapter.js';
import { isValidAdapterName, ADAPTER_NAMES } from './layoutAdapterContract.js';
import {
  coerceLayoutMapping,
  resolveGeminiApiKey
} from '../geminiVisionService.js';
import logger from '../../utils/logger.js';

const ADAPTERS = {
  gemini: geminiAdapter,
  claude: claudeAdapter,
  perplexity: perplexityAdapter
};

/**
 * @returns {string}
 */
export function resolveActiveLlm() {
  const name = String(process.env.ACTIVE_LLM || 'gemini').toLowerCase().trim();
  return isValidAdapterName(name) ? name : 'gemini';
}

/**
 * @returns {import('./layoutAdapterContract.js').LayoutAdapter}
 */
export function getActiveAdapter() {
  const name = resolveActiveLlm();
  const adapter = ADAPTERS[name];
  if (!adapter) return geminiAdapter;
  return adapter;
}

/**
 * @returns {boolean}
 */
export function resolveLlmApiKey() {
  return getActiveAdapter().resolveApiKey();
}

/**
 * @param {Buffer} pdfBuffer
 * @param {object} [options]
 */
export async function learnTemplateLayout(pdfBuffer, options = {}) {
  const adapter = getActiveAdapter();
  logger.info('[AI_LAYOUT] learnTemplateLayout', { adapter: adapter.getName() });
  return adapter.learnTemplateLayout(pdfBuffer, options);
}

/**
 * @deprecated Brute-force vision row extraction is no longer used on the checksum
 * rescue path — the Diagnostic AI Rescue pattern (aiDiagnosticService +
 * checksumAutoCorrection) replaces it. Retained only for legacy/non-rescue callers.
 * @param {Buffer} pdfBuffer
 * @param {object} [options]
 */
export async function extractTransactionRows(pdfBuffer, options = {}) {
  const adapter = getActiveAdapter();
  logger.warn('[AI_LAYOUT] extractTransactionRows is deprecated for checksum rescue', {
    adapter: adapter.getName()
  });
  return adapter.extractTransactionRows(pdfBuffer, options);
}

export function rowFallbackEnabled() {
  const v = process.env.GEMINI_VISION_ROW_FALLBACK;
  if (v === 'false' || v === '0') return false;
  return resolveLlmApiKey();
}

export { coerceLayoutMapping, resolveGeminiApiKey, ADAPTER_NAMES };

export default {
  resolveActiveLlm,
  getActiveAdapter,
  resolveLlmApiKey,
  learnTemplateLayout,
  extractTransactionRows,
  rowFallbackEnabled,
  coerceLayoutMapping
};
