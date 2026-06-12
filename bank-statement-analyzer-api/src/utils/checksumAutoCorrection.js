/**
 * Programmatic auto-correction for high-confidence checksum diagnoses.
 *
 * Currently handles COLUMN_FLIP (credits/debits systematically inverted) by
 * flipping the sign of the affected rows and re-running the parse-quality
 * pipeline. The diagnostic AI only *names* the anomaly; the math correction is
 * deterministic here so we never trust an LLM to rewrite amounts.
 */

import {
  applyParseQualityPipeline,
  attachChecksumDeltaProbe
} from './statementParseQuality.js';
import logger from './logger.js';

const DEFAULT_MIN_CONFIDENCE = 0.8;

export function resolveAutoCorrectMinConfidence() {
  const raw = Number(process.env.AI_DIAGNOSTIC_AUTO_CORRECT_MIN_CONFIDENCE);
  return Number.isFinite(raw) && raw > 0 && raw <= 1 ? raw : DEFAULT_MIN_CONFIDENCE;
}

/**
 * Flip credit/debit by negating amount. Type is intentionally NOT hard-set here
 * because the downstream ledger normalizer re-derives type from the final sign.
 * @param {Array<object>} transactions
 * @param {number[]} [affectedRows] - 0-based indices; empty/omitted flips all rows
 * @returns {Array<object>}
 */
export function flipCreditDebitRows(transactions, affectedRows = []) {
  if (!Array.isArray(transactions)) return [];
  const targetAll = !Array.isArray(affectedRows) || affectedRows.length === 0;
  const targets = new Set(targetAll ? [] : affectedRows);

  return transactions.map((tx, index) => {
    if (!tx || typeof tx !== 'object') return tx;
    if (!targetAll && !targets.has(index)) return tx;
    const amt = Number(tx.amount);
    if (!Number.isFinite(amt) || amt === 0) return tx;
    const flipped = -amt;
    return {
      ...tx,
      amount: flipped,
      type: flipped >= 0 ? 'CREDIT' : 'DEBIT'
    };
  });
}

/**
 * Attempt to auto-correct a statement based on an AI diagnosis. Mutates `stmt`
 * in place when the correction makes the checksum reconcile; otherwise restores
 * the original rows so the statement is saved as-is for HITL review.
 *
 * @param {object} stmt - parsed statement (mutated in place on success)
 * @param {{ diagnosis: string, explanation: string, affectedRows: number[], confidenceScore: number }} diagnostic
 * @param {object} [identitySources] - REQUIRED for applyParseQualityPipeline deal-identity checks
 * @returns {Promise<{ corrected: boolean, reason: string }>}
 */
export async function applyDiagnosticCorrection(stmt, diagnostic, identitySources = {}) {
  if (!stmt || typeof stmt !== 'object' || !diagnostic) {
    return { corrected: false, reason: 'invalid_input' };
  }

  if (diagnostic.diagnosis === 'MISALIGNED_COLUMNS') {
    logger.info('[AI_DIAGNOSTIC_RESCUE] MISALIGNED_COLUMNS cannot be auto-corrected, bypassing', {
      fileName: stmt.fileName,
      confidenceScore: diagnostic.confidenceScore
    });
    return { corrected: false, reason: 'MISALIGNED_COLUMNS_UNCORRECTABLE' };
  }

  const minConfidence = resolveAutoCorrectMinConfidence();
  if (diagnostic.diagnosis !== 'COLUMN_FLIP' || diagnostic.confidenceScore < minConfidence) {
    return { corrected: false, reason: 'no_auto_correct' };
  }

  const original = (stmt.transactions || []).map((t) => ({ ...t }));
  stmt.transactions = flipCreditDebitRows(stmt.transactions, diagnostic.affectedRows);

  // Re-run sanitize -> normalize -> reconciliation (FIX7: identitySources threaded).
  applyParseQualityPipeline(stmt, identitySources);
  // FIX8: delta probe is async and only runs when checksum still fails.
  await attachChecksumDeltaProbe(stmt);

  if (stmt.checksumRecon?.ok) {
    stmt.parseQuality = 'OK';
    stmt.aiDiagnostic = {
      ...diagnostic,
      autoCorrected: true,
      rescueMethod: 'COLUMN_FLIP'
    };
    logger.info('[AI_DIAGNOSTIC_RESCUE] COLUMN_FLIP auto-corrected', {
      fileName: stmt.fileName,
      affectedRows: diagnostic.affectedRows?.length || 'all',
      confidenceScore: diagnostic.confidenceScore
    });
    return { corrected: true, reason: 'COLUMN_FLIP' };
  }

  // Correction did not reconcile — restore original rows and re-derive state.
  stmt.transactions = original;
  applyParseQualityPipeline(stmt, identitySources);
  await attachChecksumDeltaProbe(stmt);
  stmt.aiDiagnostic = { ...diagnostic, autoCorrected: false, rescueMethod: 'COLUMN_FLIP_REVERTED' };
  logger.warn('[AI_DIAGNOSTIC_RESCUE] COLUMN_FLIP did not reconcile — reverted', {
    fileName: stmt.fileName,
    delta: stmt.checksumRecon?.delta
  });
  return { corrected: false, reason: 'flip_did_not_reconcile' };
}

export default {
  flipCreditDebitRows,
  applyDiagnosticCorrection,
  resolveAutoCorrectMinConfidence
};
