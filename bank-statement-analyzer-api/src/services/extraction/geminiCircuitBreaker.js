/**
 * Gemini layout-teach circuit breaker + human rescue counters.
 * Quota (429) trips the batch circuit; AI quality failure does NOT.
 */
import logger from '../../utils/logger.js';

const MAX_HUMAN_RESCUE = Number(process.env.LAYOUT_HUMAN_RESCUE_MAX) || 2;

let tripped = false;
let tripReason = null;
let tripAt = null;
const docAiAttempts = new Map();
const humanRescueAttempts = new Map();
/** @type {Map<string, { at: string, resultOk: boolean, reason?: string }>} */
const aiQualityFails = new Map();

export function resetGeminiCircuitBreaker() {
  tripped = false;
  tripReason = null;
  tripAt = null;
  docAiAttempts.clear();
  humanRescueAttempts.clear();
  aiQualityFails.clear();
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
 * Trip the breaker so subsequent batch files skip automatic Gemini.
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
 * Record a successful HTTP Gemini response that failed verification.
 * Does not trip the quota circuit.
 * @param {string} documentKey
 * @param {{ reason?: string }} [info]
 */
export function recordAiQualityFailure(documentKey, info = {}) {
  const key = String(documentKey || 'unknown');
  aiQualityFails.set(key, {
    at: new Date().toISOString(),
    resultOk: false,
    reason: info.reason || 'ai_layout_failed_verification'
  });
  logger.warn('[GEMINI_QUALITY] Layout teach returned unverified mapping', {
    documentKey: key,
    reason: info.reason
  });
}

export function getAiQualityFailure(documentKey) {
  return aiQualityFails.get(String(documentKey || 'unknown')) || null;
}

/**
 * @param {string} documentKey
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
 * Human-in-the-loop rescue: independent of auto one-shot; bypasses quota circuit
 * but still capped (default 2).
 * @param {string} documentKey
 * @returns {{ allowed: boolean, attempt: number, max: number, reason?: string }}
 */
export function beginHumanRescueAttempt(documentKey) {
  const key = String(documentKey || 'unknown');
  const n = humanRescueAttempts.get(key) || 0;
  if (n >= MAX_HUMAN_RESCUE) {
    return {
      allowed: false,
      attempt: n,
      max: MAX_HUMAN_RESCUE,
      reason: 'human_rescue_exhausted'
    };
  }
  const next = n + 1;
  humanRescueAttempts.set(key, next);
  logger.info('[GEMINI_HITL] Human layout rescue attempt', {
    documentKey: key,
    attempt: next,
    max: MAX_HUMAN_RESCUE,
    circuitOpen: tripped
  });
  return { allowed: true, attempt: next, max: MAX_HUMAN_RESCUE };
}

export function getHumanRescueAttempts(documentKey) {
  return humanRescueAttempts.get(String(documentKey || 'unknown')) || 0;
}

/**
 * Wrap an async Gemini call with quota trip + per-doc auto limit.
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

/**
 * Escape-hatch descriptor for review packets.
 * @param {string} statementId
 */
export function buildEscapeHatch(statementId) {
  return {
    endpoint: `/api/statements/${statementId}/layout-rescue`,
    method: 'POST',
    maxAttempts: MAX_HUMAN_RESCUE,
    recommendedNextAction: 'human_layout_rescue'
  };
}

export default {
  resetGeminiCircuitBreaker,
  isGeminiCircuitOpen,
  tripGeminiCircuit,
  beginDocumentAiAttempt,
  beginHumanRescueAttempt,
  getHumanRescueAttempts,
  withGeminiGuard,
  isGeminiQuotaError,
  geminiCircuitStatus,
  recordAiQualityFailure,
  getAiQualityFailure,
  buildEscapeHatch,
  MAX_HUMAN_RESCUE
};
