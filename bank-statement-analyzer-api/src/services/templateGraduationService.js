/**
 * Template lifecycle: checksum reconciliation and LEARNING → VERIFIED graduation.
 * @license Copyright (c) 2025 Shift 4 Financial INC
 */

import BigNumber from 'bignumber.js';
import InstitutionalProfile from '../models/InstitutionalProfile.js';
import riskAnalysisService from './riskAnalysisService.js';
import logger from '../utils/logger.js';

const TOLERANCE = new BigNumber('0.01');

function toBigNumber(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return new BigNumber(value);
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value);
    if (Number.isFinite(n)) return new BigNumber(n);
  }
  return new BigNumber(0);
}

/**
 * Version of the layout template that drove parsing: VERIFIED wins, else highest LEARNING.
 * @param {Array<{ version?: number, status?: string }> | undefined} templates
 * @returns {number | null}
 */
export function resolveGraduationTemplateVersion(templates) {
  const list = Array.isArray(templates) ? templates : [];
  const verified = list.find((t) => String(t.status || '').toUpperCase() === 'VERIFIED');
  if (verified && Number.isFinite(verified.version)) return verified.version;
  const learning = list
    .filter((t) => String(t.status || '').toUpperCase() === 'LEARNING')
    .sort((a, b) => (b.version || 0) - (a.version || 0));
  const top = learning[0];
  return top && Number.isFinite(top.version) ? top.version : null;
}

/**
 * Checksum guard: (opening + deposits) − withdrawals ≈ closing (within $0.01).
 * @param {object} parseResult
 * @returns {{ ok: boolean, reason?: string, opening: number, closing: number, deposits: number, withdrawals: number, computedClosing: string, delta: string }}
 */
export function validateReconciliation(parseResult) {
  const txs = Array.isArray(parseResult?.transactions) ? parseResult.transactions : [];
  const { totalDeposits, totalWithdrawals } = riskAnalysisService.calculateTotalDepositsAndWithdrawals(txs);

  const openingRaw =
    typeof parseResult?.openingBalance === 'number'
      ? parseResult.openingBalance
      : parseResult?.balances?.opening ?? 0;
  const closingRaw =
    typeof parseResult?.closingBalance === 'number'
      ? parseResult.closingBalance
      : parseResult?.balances?.closing ?? 0;

  const opening = toBigNumber(openingRaw);
  const closing = toBigNumber(closingRaw);
  const deposits = toBigNumber(totalDeposits);
  const withdrawals = toBigNumber(totalWithdrawals);

  const computedClosing = opening.plus(deposits).minus(withdrawals);
  const delta = computedClosing.minus(closing).abs();
  const ok = delta.isLessThanOrEqualTo(TOLERANCE);

  return {
    ok,
    reason: ok
      ? undefined
      : `checksum mismatch: |computed−closing|=${delta.toFixed(4)} > tolerance ${TOLERANCE.toString()}`,
    opening: opening.toNumber(),
    closing: closing.toNumber(),
    deposits: deposits.toNumber(),
    withdrawals: withdrawals.toNumber(),
    computedClosing: computedClosing.toFixed(2),
    delta: delta.toFixed(4)
  };
}

/**
 * Update template counters and status after a checksum reconciliation outcome.
 * @param {string} routingNumber
 * @param {number} templateVersion
 * @param {boolean} isSuccess
 * @param {{ lastError?: string }} [extra]
 */
export async function processTemplateOutcome(routingNumber, templateVersion, isSuccess, extra = {}) {
  const cleanedRtn = String(routingNumber || '').replace(/\D/g, '');
  if (cleanedRtn.length !== 9 || !Number.isFinite(templateVersion)) {
    return null;
  }

  const doc = await InstitutionalProfile.findOne({ routingNumber: cleanedRtn });
  if (!doc?.templates?.length) return null;

  const idx = doc.templates.findIndex((t) => t.version === templateVersion);
  if (idx === -1) return null;

  const t = doc.templates[idx];
  const prevStreak = Number.isFinite(t.consecutiveSuccesses)
    ? t.consecutiveSuccesses
    : Number.isFinite(t.successCount)
      ? t.successCount
      : 0;

  if (isSuccess) {
    if (String(t.status || '').toUpperCase() === 'FAILED') {
      t.status = 'LEARNING';
    }
    t.totalProcessed = (t.totalProcessed || 0) + 1;
    t.consecutiveSuccesses = prevStreak + 1;
    t.lastError = undefined;
    if (t.status !== 'VERIFIED' && t.consecutiveSuccesses >= 5) {
      t.status = 'VERIFIED';
      logger.info({
        msg: `[GRADUATION] Template ${templateVersion} for ${cleanedRtn} promoted to VERIFIED`,
        service: 'bank-statement-analyzer',
        timestamp: new Date().toISOString(),
        rtn: cleanedRtn,
        version: templateVersion,
        consecutiveSuccesses: t.consecutiveSuccesses,
        totalProcessed: t.totalProcessed
      });
    } else {
      logger.info({
        msg: `[GRADUATION] Template ${templateVersion} for ${cleanedRtn} success streak: ${t.consecutiveSuccesses}/5`,
        service: 'bank-statement-analyzer',
        timestamp: new Date().toISOString(),
        rtn: cleanedRtn,
        version: templateVersion,
        consecutiveSuccesses: t.consecutiveSuccesses,
        totalProcessed: t.totalProcessed
      });
    }
  } else {
    t.consecutiveSuccesses = 0;
    t.lastError = (extra.lastError || 'reconciliation_failed').slice(0, 2000);
    if (String(t.status || '').toUpperCase() === 'LEARNING') {
      t.status = 'FAILED';
    }
    logger.warn({
      msg: `[GRADUATION] Template ${templateVersion} for ${cleanedRtn} reconciliation failed`,
      service: 'bank-statement-analyzer',
      timestamp: new Date().toISOString(),
      rtn: cleanedRtn,
      version: templateVersion,
      lastError: t.lastError
    });
  }

  doc.markModified('templates');
  await doc.save();
  return {
    templateVersion,
    status: t.status,
    consecutiveSuccesses: t.consecutiveSuccesses,
    totalProcessed: t.totalProcessed
  };
}

export function buildReconciliationMismatchAlert(recon) {
  return {
    code: 'RECONCILIATION_MISMATCH',
    type: 'COMPLIANCE',
    severity: 'MEDIUM',
    title: 'Checksum guard: opening + deposits − withdrawals ≠ closing',
    message: recon.reason || 'Statement totals do not reconcile within tolerance.',
    recommendation: 'Human review: verify parser layout template or PDF totals.',
    data: {
      opening: recon.opening,
      closing: recon.closing,
      deposits: recon.deposits,
      withdrawals: recon.withdrawals,
      computedClosing: recon.computedClosing,
      delta: recon.delta
    }
  };
}
