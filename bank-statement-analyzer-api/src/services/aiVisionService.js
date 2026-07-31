/**
 * AI.Vision Service — provider-agnostic router.
 *
 * Picks a vision provider based on the AI_VISION_PROVIDOR environment variable.
 * Defaults to 'gemini'. Swapping providers requires no caller code changes.
 *
 * Supported providers:
 *   gemini     — Gemini 1.5 Pro multimodal vision (default)
 *   claude     — Claude Sonnet Vision (requires @anthropic-ai/sdk)
 *   gpt4v      — GPT-4V/Vision (requires openai package)
 *   surya      — Surya VLM local OCR (requires Python surya-ocr)
 *   mistral    — Mistral OCR specialized document OCR (REST API)
 *   openrouter — OpenRouter unified API for 200+ models (REST, fetch-based)
 *
 * @license Copyright (c) 2025 Shift 4 Financial INC
 */

// ---- Re-export helpers from the Gemini provider for backward compatibility ----
// These helpers are provider-agnostic (pure JSON coercion, not LLM-specific).
// Re-exporting them here lets callers like templateLearningService.js import
// everything from a single module.
export {
  MATH_PATTERNS,
  coerceLayoutMapping,
  extractJsonObject
} from './providers/geminiVisionProvider.js';

// Also re-export resolveGeminiApiKey from the legacy service for env compat
export { resolveGeminiApiKey } from './geminiVisionService.js';

// ---- Provider loading ----

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
 * Providers are loaded lazily on first call and cached.
 * @returns {Promise<import('./providers/geminiVisionProvider.js').geminiVisionProvider>}
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
      'Set AI_VISION_PROVIDOR to one of these values.'
    );
  }

  const mod = await loader();
  cachedProvider = mod.default || mod.geminiVisionProvider || mod.claudeVisionProvider || mod.gpt4vVisionProvider || mod.suryaVisionProvider || mod.mistralOcrProvider;
  return cachedProvider;
}

// ---- Public API ----

/**
 * Analyze a bank statement PDF and return a layout mapping for Helios deterministic runners.
 * Delegates to the configured AI_VISION_PROVIDOR.
 *
 * @param {Buffer} pdfBuffer
 * @param {{ rtn?: string, bankName?: string, statementId?: string, jobId?: string, digitalTextExcerpt?: string, sampleRows?: Array, printedOpeningBalance?: number, printedClosingBalance?: number }} [options]
 * @returns {Promise<object>} layout mapping with headerAnchors, columnMapping, mathPattern, etc.
 */
export async function analyzeStatementLayout(pdfBuffer, options = {}) {
  const provider = await getProvider();
  return provider.analyzeStatementLayout(pdfBuffer, options);
}

/**
 * Extract the first maxPages from a PDF buffer.
 * Delegates to the configured provider (uses pdf-lib, which is provider-agnostic).
 *
 * @param {Buffer} pdfBuffer
 * @param {number} maxPages
 * @returns {Promise<Buffer>}
 */
export async function extractFirstPagesPdfBuffer(pdfBuffer, maxPages) {
  const provider = await getProvider();
  return provider.extractFirstPagesPdfBuffer(pdfBuffer, maxPages);
}