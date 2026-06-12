/**
 * Vera Delta — section-scoped fee/transaction discrepancy analysis.
 * Never re-parses full PDF.
 */

import logger from '../utils/logger.js';

const AUTO_FIX_CONFIDENCE = 0.8;

/**
 * Build prompt payload for fee/txn delta (no PDF buffer).
 * @param {object} input
 */
export function buildVeraDeltaPrompt(input = {}) {
  const { feeTransactions = [], checksumDelta = {}, sectionText = '' } = input;
  return {
    system:
      'You are Vera, a bank statement reconciliation analyst. Given checksum deltas and fee rows, propose minimal printed-total fixes. Return JSON only.',
    user: JSON.stringify({
      checksumDelta,
      feeTransactionSample: feeTransactions.slice(0, 25),
      sectionExcerpt: String(sectionText).slice(0, 4000)
    })
  };
}

/**
 * Parse LLM JSON response into delta fixes.
 * @param {string|object} raw
 * @returns {Array<object>}
 */
export function parseVeraDeltaResponse(raw) {
  let parsed = raw;
  if (typeof raw === 'string') {
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return [];
    try {
      parsed = JSON.parse(jsonMatch[0]);
    } catch {
      return [];
    }
  }
  const fixes = parsed?.fixes ?? parsed?.deltaFixes ?? [];
  return fixes.map((f) => ({
    field: f.field,
    proposedValue: f.proposedValue ?? f.value,
    confidence: Number(f.confidence ?? 0),
    rationale: f.rationale ?? f.reason ?? ''
  }));
}

/**
 * Run Vera Delta analysis (section-scoped).
 * @param {object} input
 * @param {Function} [input.llmFn] — injected for tests; must NOT receive PDF buffer
 * @returns {Promise<object>}
 */
export async function runVeraDeltaAnalysis(input = {}) {
  const started = Date.now();
  const { feeTransactions = [], checksumDelta = {}, sectionText = '', llmFn = null } = input;

  if (typeof llmFn !== 'function') {
    return {
      deltaFixes: [],
      skipped: true,
      reason: 'no_llm_fn',
      metrics: {
        veraCallType: 'vera_delta',
        sectionCount: 1,
        durationMs: Date.now() - started,
        fullPdfReparse: false
      }
    };
  }

  const prompt = buildVeraDeltaPrompt({ feeTransactions, checksumDelta, sectionText });
  const raw = await llmFn(prompt);
  const fixes = parseVeraDeltaResponse(raw).filter(
    (f) => f.confidence >= AUTO_FIX_CONFIDENCE
  );

  logger.info('[VERA_DELTA] analysis complete', {
    veraCallType: 'vera_delta',
    fixCount: fixes.length,
    durationMs: Date.now() - started,
    fullPdfReparse: false
  });

  return {
    deltaFixes: fixes,
    metrics: {
      veraCallType: 'vera_delta',
      sectionCount: 1,
      durationMs: Date.now() - started,
      fullPdfReparse: false
    }
  };
}

export default { buildVeraDeltaPrompt, parseVeraDeltaResponse, runVeraDeltaAnalysis, AUTO_FIX_CONFIDENCE };
