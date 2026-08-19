/**
 * ProcessingRun HITL resolve — ledger corrections + InstitutionalProfile VERIFIED.
 * @license Copyright (c) 2025 Shift 4 Financial INC
 */

import mongoose from 'mongoose';
import ProcessingRun from '../models/ProcessingRun.js';
import Statement from '../models/Statement.js';
import InstitutionalProfile from '../models/InstitutionalProfile.js';
import logger from '../utils/logger.js';
import { ValidationError, NotFoundError, ConflictError } from '../utils/errors.js';

/**
 * Immediately graduate InstitutionalProfile templates to VERIFIED for an RTN.
 * @param {string} rtn
 */
export async function graduateInstitutionalProfileVerified(rtn) {
  const cleaned = String(rtn || '').replace(/\D/g, '');
  if (cleaned.length !== 9) return null;

  const profile = await InstitutionalProfile.findOne({ routingNumber: cleaned });
  if (!profile) return null;

  profile.manuallyVerified = true;
  const templates = Array.isArray(profile.templates) ? profile.templates : [];
  for (const t of templates) {
    if (t && t.status !== 'VERIFIED') {
      t.status = 'VERIFIED';
      t.consecutiveSuccesses = Math.max(Number(t.consecutiveSuccesses) || 0, 5);
      t.lastError = undefined;
    }
  }
  if (templates.length === 0) {
    profile.templates.push({
      version: 1,
      status: 'VERIFIED',
      consecutiveSuccesses: 5,
      totalProcessed: 1,
      mapping: {}
    });
  }
  profile.markModified('templates');
  await profile.save();
  return profile;
}

/**
 * Apply human corrections to a Statement ledger and mark COMPLETED.
 * @param {import('mongoose').Document} statement
 * @param {object} corrections
 */
export function applyLedgerCorrections(statement, corrections) {
  const {
    openingBalance,
    closingBalance,
    totalDeposits,
    totalWithdrawals,
    transactions
  } = corrections || {};

  const nums = [openingBalance, closingBalance, totalDeposits, totalWithdrawals];
  for (const n of nums) {
    if (typeof n !== 'number' || !Number.isFinite(n)) {
      throw new ValidationError(
        'corrections.openingBalance, closingBalance, totalDeposits, and totalWithdrawals must be finite numbers'
      );
    }
  }

  statement.openingBalance = openingBalance;
  statement.closingBalance = closingBalance;
  statement.status = 'COMPLETED';
  statement.processedDate = new Date();

  const prevAnalytics =
    statement.analytics && typeof statement.analytics === 'object'
      ? statement.analytics.toObject?.() ?? { ...statement.analytics }
      : {};
  statement.analytics = {
    ...prevAnalytics,
    totalDeposits,
    totalWithdrawals
  };

  if (Array.isArray(transactions)) {
    statement.transactions = transactions;
    statement.markModified('transactions');
  }

  statement.alerts = (statement.alerts || []).filter((a) => a.code !== 'RECONCILIATION_MISMATCH');
  statement.markModified('analytics');
  statement.markModified('alerts');

  const prevMeta =
    statement.metadata && typeof statement.metadata === 'object'
      ? statement.metadata.toObject?.() ?? { ...statement.metadata }
      : {};
  statement.metadata = {
    ...prevMeta,
    hitlResolved: true,
    checksumRecon: {
      ok: true,
      opening: openingBalance,
      closing: closingBalance,
      deposits: totalDeposits,
      withdrawals: totalWithdrawals,
      computedClosing: String(openingBalance + totalDeposits - totalWithdrawals),
      delta: '0'
    }
  };
  statement.markModified('metadata');
}

/**
 * POST /api/processing-runs/:runId/resolve
 */
export async function resolveProcessingRun(runId, body = {}, actorUserId = null) {
  if (!mongoose.Types.ObjectId.isValid(runId)) {
    throw new ValidationError('Invalid processing run ID');
  }

  const run = await ProcessingRun.findById(runId);
  if (!run) throw new NotFoundError('ProcessingRun not found');

  if (String(run.status).toUpperCase() !== 'REQUIRES_HUMAN_REVIEW') {
    throw new ConflictError('ProcessingRun is not awaiting human review');
  }

  const corrections = body.corrections || body;
  const fileName = body.fileName || run.failingFileNames?.[0] || null;
  let rtn = String(body.rtn || run.rtn || '').replace(/\D/g, '');

  let statement = null;
  const ids = (run.statementIds || []).map((id) => String(id));
  if (ids.length > 0) {
    statement = await Statement.findById(ids[0]);
  }
  if (!statement && fileName) {
    statement = await Statement.findOne({
      $or: [{ originalFileName: fileName }, { fileName }, { 'metadata.sourceFileName': fileName }]
    }).sort({ createdAt: -1 });
  }

  if (statement) {
    applyLedgerCorrections(statement, corrections);
    await statement.save();
    if (!rtn) {
      rtn = String(statement.metadata?.vera?.rtn || statement.routingNumber || '')
        .replace(/\D/g, '')
        .slice(0, 9);
    }
  }

  const profile = await graduateInstitutionalProfileVerified(rtn);

  run.status = 'RESOLVED';
  const prevPayload =
    run.reviewPayload && typeof run.reviewPayload === 'object' ? { ...run.reviewPayload } : {};
  run.reviewPayload = {
    ...prevPayload,
    resolution: {
      corrections: {
        openingBalance: corrections.openingBalance,
        closingBalance: corrections.closingBalance,
        totalDeposits: corrections.totalDeposits,
        totalWithdrawals: corrections.totalWithdrawals
      },
      fileName,
      resolvedAt: new Date().toISOString(),
      resolvedBy: actorUserId ? String(actorUserId) : null,
      statementId: statement ? String(statement._id) : null,
      profileVerified: Boolean(profile)
    }
  };
  run.markModified('reviewPayload');
  await run.save();

  logger.info('[HITL] ProcessingRun RESOLVED', {
    processingRunId: String(run._id),
    statementId: statement ? String(statement._id) : null,
    rtn: rtn || null,
    profileVerified: Boolean(profile)
  });

  return {
    success: true,
    processingRunId: String(run._id),
    statementId: statement ? String(statement._id) : null,
    profileStatus: profile ? 'VERIFIED' : rtn.length === 9 ? 'PROFILE_NOT_FOUND' : 'NO_RTN',
    status: 'RESOLVED'
  };
}

export default { resolveProcessingRun, graduateInstitutionalProfileVerified, applyLedgerCorrections };
