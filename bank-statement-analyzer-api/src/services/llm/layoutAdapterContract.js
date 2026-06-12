/**
 * Shared contract for hot-swappable LLM layout/row adapters.
 *
 * Previously referenced by aiLayoutService.js and the gemini/claude/perplexity
 * adapters but never committed, leaving a dead import that throws at startup.
 */

/**
 * Canonical adapter names recognized by the orchestrator.
 * @type {ReadonlyArray<string>}
 */
export const ADAPTER_NAMES = Object.freeze(['gemini', 'claude', 'perplexity']);

/**
 * @param {string} name
 * @returns {boolean}
 */
export function isValidAdapterName(name) {
  if (typeof name !== 'string') return false;
  return ADAPTER_NAMES.includes(name.toLowerCase().trim());
}

/**
 * @typedef {object} LayoutAdapter
 * @property {() => string} getName - Adapter identifier (one of ADAPTER_NAMES).
 * @property {() => boolean} resolveApiKey - True when the adapter has credentials configured.
 * @property {(pdfBuffer: Buffer, options?: object) => Promise<object>} learnTemplateLayout - One-time layout teach.
 * @property {(pdfBuffer: Buffer, options?: object) => Promise<object>} extractTransactionRows - Brute-force row extraction (deprecated for checksum rescue).
 */

export default { ADAPTER_NAMES, isValidAdapterName };
