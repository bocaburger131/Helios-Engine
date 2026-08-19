/**
 * AI Vision Service — canonical provider-agnostic entry point.
 *
 * Prefer: `import … from '../ai/aiVisionService.js'` (or `services/ai/aiVisionService.js`).
 *
 * @deprecated Paths that still import `geminiVisionService.js` remain supported via
 * that module's re-exports / implementation, but new code should use this file.
 *
 * @license Copyright (c) 2025 Shift 4 Financial INC
 */

export {
  MATH_PATTERNS,
  coerceLayoutMapping,
  extractJsonObject,
  analyzeStatementLayout,
  extractFirstPagesPdfBuffer,
  resolveGeminiApiKey,
  AI_VISION_FALLBACK_SOURCE,
  LEGACY_GEMINI_ROW_FALLBACK_SOURCE,
  isAiVisionFallbackSource
} from '../aiVisionService.js';

export {
  extractTransactionRows,
  rowFallbackEnabled,
  resolveGeminiVisionModel,
  resolveGeminiRowExtractionModel,
  prenormalizeVisionPayload,
  coerceVisionTransactionRows,
  normalizeVisionTransactionRow,
  extractPdfBufferMaxPages
} from '../geminiVisionService.js';
