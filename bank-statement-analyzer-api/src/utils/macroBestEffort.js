/**
 * Best-effort macro helpers when batch checksum gate fails but transactions exist.
 * @license Copyright (c) 2025 Shift 4 Financial INC
 */

import { validateData } from '../validation/validateData.js';
import { alertSchema } from '../validation/alertSchema.js';
import logger from '../utils/logger.js';

/**
 * @param {object} stmt
 * @param {boolean} bestEffortChecksumMode
 * @returns {boolean}
 */
export function includeStatementInMacro(stmt, bestEffortChecksumMode) {
  if (!stmt || typeof stmt !== 'object') return false;
  if (stmt.parseQuality === 'OK') return true;
  if (!bestEffortChecksumMode) return false;
  return (stmt.transactions || []).some((t) => t && t.parseExcluded !== true);
}

/**
 * @param {Array<object>} parsedStatements
 * @returns {boolean}
 */
export function batchHasUsableTransactions(parsedStatements) {
  return (parsedStatements || []).some(
    (s) => (s.transactions || []).filter((t) => t && !t.parseExcluded).length > 0
  );
}

/**
 * Build a Mongoose-valid alert for checksum gate best-effort continuation.
 * @param {{ ratio: number, okCount: number, total: number }} batchChecksumStats
 * @param {number} minRatio
 * @param {object} [batchOutcome]
 */
export function buildChecksumGateBestEffortAlert(batchChecksumStats, minRatio, batchOutcome) {
  const ratioPct = (batchChecksumStats.ratio * 100).toFixed(0);
  const minPct = (minRatio * 100).toFixed(0);
  const alert = {
    code: 'RECONCILIATION_MISMATCH',
    type: 'COMPLIANCE',
    severity: 'HIGH',
    title: 'Batch checksum pass ratio below threshold',
    message: `Batch checksum pass ratio ${ratioPct}% below ${minPct}% — returning best-effort analysis.`,
    recommendation: 'Review parseQualityByFile; transactions are best-effort.',
    data: {
      checksumPassRatio: batchChecksumStats.ratio,
      checksumMinRatio: minRatio,
      okCount: batchChecksumStats.okCount,
      total: batchChecksumStats.total,
      parseOutcome: batchOutcome ?? null
    }
  };
  const alertValidation = validateData(alertSchema, alert, { label: 'buildChecksumGateBestEffortAlert' });
  if (!alertValidation.ok) { logger.warn('alert validation failed', { errors: alertValidation.errors.slice(0, 3) }); }
  return alert;
}

/**
 * Hard-fail (422 CHECKSUM_GATE_FAILED) only when there is nothing to review.
 * With usable transactions, continue best-effort so ProcessingRun HITL can open.
 * @param {boolean} hasUsableTxns
 * @returns {boolean}
 */
export function shouldHardFailChecksumGate(hasUsableTxns) {
  return !Boolean(hasUsableTxns);
}

/**
 * @param {{ ratio: number }} batchChecksumStats
 * @param {Array<object>} parsedStatements
 * @param {number} minRatio
 * @param {number} [httpStatus] retained for callers; 422 no longer blocks best-effort when txs exist
 * @returns {boolean}
 */
export function deriveBestEffortChecksumMode(
  batchChecksumStats,
  parsedStatements,
  minRatio,
  httpStatus = 200
) {
  void httpStatus;
  if (batchChecksumStats.ratio >= minRatio) return false;
  // Prefer HITL / best-effort continuation whenever extractable txs exist,
  // even if resolveBatchHttpStatus would have been 422.
  return batchHasUsableTransactions(parsedStatements);
}

/**
 * Tag transactions with source statement parse quality for macro output.
 * @param {object} stmt
 * @param {Array<object>} transactions
 * @returns {Array<object>}
 */
export function tagMacroTransactionsFromStatement(stmt, transactions) {
  const parseQuality = stmt.parseQuality || 'UNKNOWN';
  const bestEffort = parseQuality !== 'OK';
  return transactions.map((t) => ({
    ...t,
    sourceParseQuality: parseQuality,
    ...(bestEffort ? { macroBestEffort: true } : {})
  }));
}
