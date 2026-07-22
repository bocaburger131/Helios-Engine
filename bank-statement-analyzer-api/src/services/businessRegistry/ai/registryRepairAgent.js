/**
 * Propose playbook selector patches when health checks fail.
 */

import logger from '../../../utils/logger.js';

/**
 * @param {{ stateCode: string, currentPlaybook: object, error: string }} params
 * @returns {Promise<object>}
 */
export async function proposePlaybookPatch(params) {
  const { stateCode, currentPlaybook, error } = params;
  const base = currentPlaybook && typeof currentPlaybook === 'object' ? { ...currentPlaybook } : {};

  if (process.env.GEMINI_API_KEY && !/^your[-_]/i.test(process.env.GEMINI_API_KEY)) {
    try {
      const prompt = `State ${stateCode} business registry playbook failed: ${error}. Current selectors: ${JSON.stringify(base.selectors || {})}. Suggest updated CSS selectors JSON only: {"selectors":{...}}`;
      const { default: geminiVisionService } = await import('../../geminiVisionService.js');
      if (typeof geminiVisionService?.analyzeText === 'function') {
        const raw = await geminiVisionService.analyzeText(prompt);
        const text = typeof raw === 'string' ? raw : raw?.text || '';
        const match = text.match(/\{[\s\S]*\}/);
        if (match) {
          const patch = JSON.parse(match[0]);
          if (patch.selectors) {
            return {
              ...base,
              selectors: { ...base.selectors, ...patch.selectors },
              repairedAt: new Date().toISOString(),
              repairReason: error
            };
          }
        }
      }
    } catch (err) {
      logger.warn(`[REGISTRY] Gemini repair failed for ${stateCode}: ${err.message}`);
    }
  }

  return {
    ...base,
    timeoutMs: (base.timeoutMs || 30000) + 15000,
    repairedAt: new Date().toISOString(),
    repairReason: error,
    repairNote: 'timeout bump fallback'
  };
}

export default { proposePlaybookPatch };
