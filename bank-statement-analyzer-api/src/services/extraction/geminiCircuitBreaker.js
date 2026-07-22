/**
 * Gemini layout-teach circuit breaker: trip on 429 / credits depleted;
 * at most one AI attempt per document when repair class is UNKNOWN_LAYOUT.
 */
import logger from '../../utils/logger.js';

let tripped = false;
let tripReason = null;
let tripAt = null;
const docAiAttempts = new Map();

export function resetGeminiCircuitBreaker() {
  tripped = false;
  tripReason = null;
  tripAt = null;
  docAiAttempts.clear();
}

export function isGeminiCircuitOpen() {
  return tripped;
}

export function geminiCircuitStatus() {
  return { open: tripped, reason: tripReason, tripAt };
}

/**
 * @param {unknown} err
 * @returns {boolean}
 */
export function isGeminiQuotaError(err) {
  const msg = String(err?.message || err || '');
  const status = err?.status || err?.statusCode || err?.code;
  if (status === 429) return true;
  return (
    /429|resource.?exhausted|quota|prepayment|credits?\s+depleted|billing/i.test(msg)
  );
}

/**
 * Trip the breaker so subsequent batch files skip Gemini.
 * @param {unknown} err
 */
export function tripGeminiCircuit(err) {
  tripped = true;
  tripReason = String(err?.message || err || 'gemini_quota');
  tripAt = new Date().toISOString();
  logger.warn('[GEMINI_CIRCUIT] Open — skipping further layout-teach calls', {
    reason: tripReason
  });
}

/**
 * @param {string} documentKey — file hash or name
 * @returns {{ allowed: boolean, reason?: string }}
 */
export function beginDocumentAiAttempt(documentKey) {
  if (tripped) {
    return { allowed: false, reason: 'circuit_open' };
  }
  const key = String(documentKey || 'unknown');
  const n = docAiAttempts.get(key) || 0;
  if (n >= 1) {
    return { allowed: false, reason: 'one_ai_attempt_max' };
  }
  docAiAttempts.set(key, n + 1);
  return { allowed: true };
}

/**
 * Wrap an async Gemini call with quota trip + per-doc limit.
 * @param {string} documentKey
 * @param {() => Promise<any>} fn
 */
export async function withGeminiGuard(documentKey, fn) {
  const begin = beginDocumentAiAttempt(documentKey);
  if (!begin.allowed) {
    return { ok: false, skipped: true, reason: begin.reason };
  }
  try {
    const result = await fn();
    return { ok: true, result };
  } catch (err) {
    if (isGeminiQuotaError(err)) {
      tripGeminiCircuit(err);
    }
    return { ok: false, error: err };
  }
}

export default {
  resetGeminiCircuitBreaker,
  isGeminiCircuitOpen,
  tripGeminiCircuit,
  beginDocumentAiAttempt,
  withGeminiGuard,
  isGeminiQuotaError,
  geminiCircuitStatus
};
