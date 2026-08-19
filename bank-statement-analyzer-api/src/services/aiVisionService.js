/**
 * AI.Vision Service — provider-agnostic router.
 *
 * Canonical import path: `services/ai/aiVisionService.js`.
 * This file remains for backwards-compatible imports from `services/aiVisionService.js`.
 *
 * Picks a vision provider based on the AI_VISION_PROVIDER / VISION_PROVIDER env.
 * Defaults to 'gemini'. Swapping providers requires no caller code changes.
 *
 * Supported providers:
 *   gemini     — Gemini multimodal vision (default)
 *   claude     — Claude Sonnet Vision (requires @anthropic-ai/sdk)
 *   gpt4v      — GPT-4V/Vision (requires openai package)
 *   surya      — Surya VLM local OCR (requires Python surya-ocr)
 *   mistral    — Mistral OCR specialized document OCR (REST API)
 *   openrouter — OpenRouter unified API for 200+ models (REST, fetch-based)
 *
 * @license Copyright (c) 2025 Shift 4 Financial INC
 */

export {
  MATH_PATTERNS,
  coerceLayoutMapping,
  extractJsonObject
} from './providers/geminiVisionProvider.js';

export { resolveGeminiApiKey } from './geminiVisionService.js';

/** Canonical extractionSource for AI Vision row fallback (new writes). */
export const AI_VISION_FALLBACK_SOURCE = 'ai_vision_fallback';

/** Legacy extractionSource retained for DB / timeline compatibility. */
export const LEGACY_GEMINI_ROW_FALLBACK_SOURCE = 'gemini_row_fallback';

/**
 * True when a transaction extractionSource is AI Vision rescue (new or legacy).
 * @param {unknown} source
 * @returns {boolean}
 */
export function isAiVisionFallbackSource(source) {
  const s = String(source || '').toLowerCase();
  return (
    s === AI_VISION_FALLBACK_SOURCE ||
    s === LEGACY_GEMINI_ROW_FALLBACK_SOURCE ||
    s.includes('ai_vision_fallback') ||
    (s.includes('gemini') && s.includes('fallback'))
  );
}

const providers = {
  gemini: () => import('./providers/geminiVisionProvider.js'),
  claude: () => import('./providers/claudeVisionProvider.js'),
  gpt4v: () => import('./providers/gpt4vVisionProvider.js'),
  surya: () => import('./providers/suryaVisionProvider.js'),
  mistral: () => import('./providers/mistralOcrProvider.js'),
  openrouter: () => import('./providers/openrouterVisionProvider.js')
};

let cachedProvider = null;

/**
 * Resolve and return the configured vision provider.
 * @returns {Promise<object>}
 */
async function getProvider() {
  const name = (process.env.AI_VISION_PROVIDER || process.env.VISION_PROVIDER || 'gemini').toLowerCase().trim();

  if (cachedProvider?.name === name) {
    return cachedProvider;
  }

  const loader = providers[name];
  if (!loader) {
    throw new Error(
      `Unknown AI vision provider: "${name}". Supported: ${Object.keys(providers).join(', ')}. ` +
        'Set AI_VISION_PROVIDER to one of these values.'
    );
  }

  const mod = await loader();
  cachedProvider =
    mod.default ||
    mod.geminiVisionProvider ||
    mod.claudeVisionProvider ||
    mod.gpt4vVisionProvider ||
    mod.suryaVisionProvider ||
    mod.mistralOcrProvider;
  return cachedProvider;
}

/**
 * Analyze a bank statement PDF and return a layout mapping for Helios deterministic runners.
 * @param {Buffer} pdfBuffer
 * @param {object} [options]
 * @returns {Promise<object>}
 */
export async function analyzeStatementLayout(pdfBuffer, options = {}) {
  const provider = await getProvider();
  return provider.analyzeStatementLayout(pdfBuffer, options);
}

/**
 * Extract the first maxPages from a PDF buffer.
 * @param {Buffer} pdfBuffer
 * @param {number} maxPages
 * @returns {Promise<Buffer>}
 */
export async function extractFirstPagesPdfBuffer(pdfBuffer, maxPages) {
  const provider = await getProvider();
  return provider.extractFirstPagesPdfBuffer(pdfBuffer, maxPages);
}
