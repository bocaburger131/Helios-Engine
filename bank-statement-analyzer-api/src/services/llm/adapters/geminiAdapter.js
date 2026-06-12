/**
 * Gemini layout + row extraction adapter.
 */

import {
  analyzeStatementLayout,
  extractTransactionRows,
  resolveGeminiApiKey,
  rowFallbackEnabled as geminiRowFallbackEnabled
} from '../../geminiVisionService.js';

/** @type {import('../layoutAdapterContract.js').LayoutAdapter} */
export const geminiAdapter = {
  getName: () => 'gemini',

  resolveApiKey: () => Boolean(resolveGeminiApiKey()),

  async learnTemplateLayout(pdfBuffer, options = {}) {
    return analyzeStatementLayout(pdfBuffer, options);
  },

  async extractTransactionRows(pdfBuffer, options = {}) {
    return extractTransactionRows(pdfBuffer, options);
  }
};

export function rowFallbackEnabled() {
  return geminiRowFallbackEnabled();
}

export default geminiAdapter;
