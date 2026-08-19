/**
 * HITL review payload builders for ProcessingRun.
 * @license Copyright (c) 2025 Shift 4 Financial INC
 */

import ProcessingRun from '../models/ProcessingRun.js';
import logger from '../utils/logger.js';

const HITL_TXN_CAP = 500;

/**
 * Slim transaction rows for Dev Console HITL grid.
 * @param {object[]} transactions
 */
export function slimHitlTransactions(transactions) {
  const list = Array.isArray(transactions) ? transactions : [];
  const out = [];
  for (let i = 0; i < list.length && out.length < HITL_TXN_CAP; i++) {
    const t = list[i];
    if (!t || t.parseExcluded) continue;
    const amt = Number(t.amount);
    let deposit = null;
    let withdrawal = null;
    if (t.deposit != null || t.credit != null) {
      deposit = Math.abs(Number(t.deposit ?? t.credit) || 0);
    } else if (Number.isFinite(amt) && amt >= 0) {
      deposit = Math.abs(amt);
    }
    if (t.withdrawal != null || t.debit != null) {
      withdrawal = Math.abs(Number(t.withdrawal ?? t.debit) || 0);
    } else if (Number.isFinite(amt) && amt < 0) {
      withdrawal = Math.abs(amt);
    }
    out.push({
      rowIndex: i,
      date: t.date || t.postedDate || null,
      description: t.description || t.desc || null,
      amount: Number.isFinite(amt) ? amt : null,
      deposit,
      withdrawal,
      balance: t.balance ?? t.endingDailyBalance ?? t.runningBalance ?? null,
      page: t.page ?? t.pageNumber ?? t.pageIndex ?? null,
      type: t.type || null,
      source: t.source || null
    });
  }
  return out;
}

/**
 * Build one file's reviewPayload entry from a parsed batch statement.
 * @param {object} stmt
 */
export function buildHitlReviewPayload(stmt) {
  if (!stmt || typeof stmt !== 'object') return null;
  const probe = stmt.checksumDeltaProbe || {};
  const reconciliationBreakdown =
    probe.reconciliationBreakdown ||
    (stmt.checksumRecon
      ? {
          opening: stmt.checksumRecon.opening ?? null,
          closing: stmt.checksumRecon.closing ?? null,
          deposits: stmt.checksumRecon.deposits ?? null,
          withdrawals: stmt.checksumRecon.withdrawals ?? null,
          computedClosing: stmt.checksumRecon.computedClosing ?? null,
          delta: stmt.checksumRecon.delta ?? null
        }
      : null);

  const rowBalanceRecon = stmt.rowBalanceRecon || null;
  const transactions = slimHitlTransactions(stmt.transactions);

  return {
    fileName: stmt.fileName || 'unknown.pdf',
    checksumRecon: stmt.checksumRecon || null,
    rowBalanceRecon,
    transactions,
    aiDiagnostic: stmt.aiDiagnostic || null,
    reconciliationBreakdown,
    parseQuality: stmt.parseQuality || null,
    bankName: stmt.bankName || null,
    rtn: String(stmt.parseResult?.rtn ?? stmt.rtn ?? '').replace(/\D/g, '').slice(0, 9) || null,
    transactionCount: (stmt.transactions || []).filter((t) => !t.parseExcluded).length
  };
}

/**
 * @param {object} stmt
 */
export function statementRequiresHitl(stmt) {
  if (!stmt || typeof stmt !== 'object') return false;
  if (stmt.checksumRecon?.ok === false) return true;
  if (stmt.rowBalanceRecon?.ok === false) return true;
  return false;
}

/**
 * @param {object[]} parsedStatements
 * @returns {object[]}
 */
export function collectFailingHitlPayloads(parsedStatements) {
  const list = Array.isArray(parsedStatements) ? parsedStatements : [];
  return list.filter(statementRequiresHitl).map(buildHitlReviewPayload).filter(Boolean);
}

/**
 * Persist a ProcessingRun in REQUIRES_HUMAN_REVIEW when any checksum failed.
 * @param {object} opts
 * @param {object[]} opts.parsedStatements
 * @param {string} [opts.correlationId]
 * @param {string} [opts.jobId]
 * @param {string} [opts.uploadSessionId]
 * @param {string[]} [opts.statementIds]
 */
export async function createHitlProcessingRunIfNeeded(opts = {}) {
  const failing = collectFailingHitlPayloads(opts.parsedStatements);
  if (failing.length === 0) return null;

  const rtn =
    failing.map((f) => f.rtn).find((r) => r && String(r).length === 9) ||
    String(opts.rtn || '').replace(/\D/g, '').slice(0, 9) ||
    '';

  const doc = await ProcessingRun.create({
    correlationId: opts.correlationId || '',
    jobId: opts.jobId || '',
    uploadSessionId: opts.uploadSessionId || '',
    status: 'REQUIRES_HUMAN_REVIEW',
    reviewPayload: {
      files: failing,
      createdAt: new Date().toISOString()
    },
    failingFileNames: failing.map((f) => f.fileName),
    rtn,
    statementIds: (opts.statementIds || []).filter(Boolean)
  });

  logger.info('[HITL] ProcessingRun REQUIRES_HUMAN_REVIEW', {
    processingRunId: String(doc._id),
    failingCount: failing.length,
    correlationId: opts.correlationId || null
  });

  return doc;
}

export default {
  buildHitlReviewPayload,
  collectFailingHitlPayloads,
  createHitlProcessingRunIfNeeded,
  statementRequiresHitl,
  slimHitlTransactions
};
