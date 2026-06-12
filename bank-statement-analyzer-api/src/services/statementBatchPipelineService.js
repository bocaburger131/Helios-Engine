/**
 * Worker-only batch pipeline orchestration (parse + macro via controller core).
 * @license Copyright (c) 2025 Shift 4 Financial INC
 */

import {
  loadTriageSession
} from './triageSessionService.js';
import logger from '../utils/logger.js';

/**
 * Build a synthetic Express req for the batch pipeline core.
 * @param {object} jobData
 */
export function buildWorkerRequest(jobData) {
  const uploadSessionId = String(jobData.uploadSessionId || '').trim();
  const session = loadTriageSession(uploadSessionId);
  if (!session) {
    throw new Error(`Triage session not found or expired: ${uploadSessionId}`);
  }

  const meta = session.manifest?.meta || {};
  let applicationData = jobData.applicationData;
  if (typeof applicationData === 'string') {
    try {
      applicationData = JSON.parse(applicationData);
    } catch {
      applicationData = {};
    }
  }
  if (!applicationData || typeof applicationData !== 'object') {
    applicationData = meta.applicationData || {};
  }

  return {
    files: session.files,
    body: {
      uploadSessionId,
      dealId: jobData.dealId ?? meta.dealId ?? null,
      businessName: jobData.businessName ?? meta.businessName ?? null,
      openingBalance: jobData.openingBalance ?? null,
      applicationData: JSON.stringify(applicationData),
      confirmedBankName: jobData.confirmedBankName || null,
      confirmedBankFileName: jobData.confirmedBankFileName || null,
      assumeSingleUnknownAccount: jobData.assumeSingleUnknownAccount
    },
    user: { id: jobData.userId || 'anonymous' },
    headers: {
      'x-correlation-id': jobData.correlationId || jobData.jobId || ''
    }
  };
}

/**
 * Express-like res that captures pipeline outcomes for the worker.
 * @param {(outcome: object) => void} settle
 */
export function createPipelineOutcomeCollector(settle) {
  let statusCode = 200;
  const res = {
    status(code) {
      statusCode = code;
      return res;
    },
    json(payload) {
      if (statusCode === 202) {
        if (payload?.requiresBankConfirmation) {
          settle({
            status: 'requires_bank_confirmation',
            success: false,
            requiresBankConfirmation: true,
            uploadSessionId: payload.uploadSessionId,
            fileName: payload.fileName,
            fileIndex: payload.fileIndex,
            detectedBankName: payload.detectedBankName,
            previewUrl: payload.previewUrl,
            bankNameCandidates: payload.bankNameCandidates,
            message: payload.message,
            batchContext: payload.batchContext
          });
          return res;
        }
        if (payload?.async) {
          settle({
            status: 'failed',
            error: 'Pipeline incorrectly returned async 202 inside worker'
          });
          return res;
        }
      }
      if (statusCode === 201) {
        if (payload?.businessStatus === 'COMPLETED_WITH_WARNINGS') {
          settle({
            status: 'COMPLETED_WITH_WARNINGS',
            result: payload,
            diagnosticSummaries: payload.diagnosticSummaries || []
          });
          return res;
        }
        settle({ status: 'completed', result: payload });
        return res;
      }
      if (statusCode === 422) {
        settle({
          status: 'failed',
          error: payload?.error || 'CHECKSUM_GATE_FAILED',
          message: payload?.message,
          details: payload
        });
        return res;
      }
      if (statusCode >= 400) {
        settle({
          status: 'failed',
          error: payload?.error || payload?.message || `HTTP ${statusCode}`,
          details: payload
        });
        return res;
      }
      settle({ status: 'completed', result: payload });
      return res;
    }
  };
  return res;
}

/**
 * Run full batch pipeline in worker context.
 * @param {object} jobData
 */
export async function runStatementBatchJob(jobData) {
  const { default: StatementController } = await import('../controllers/statementController.js');

  const req = buildWorkerRequest(jobData);
  let outcome = null;

  await new Promise((resolve, reject) => {
    const res = createPipelineOutcomeCollector((o) => {
      outcome = o;
      resolve();
    });
    const next = (err) => {
      if (err) reject(err);
      else if (!outcome) reject(new Error('Batch pipeline produced no outcome'));
      else resolve();
    };
    StatementController.executeBatchPipelineCore(req, res, next).catch(reject);
  });

  if (!outcome) {
    throw new Error('Batch pipeline produced no outcome');
  }

  if (outcome.status === 'requires_bank_confirmation') {
    logger.info('[BATCH_PIPELINE] HITL bank confirmation', {
      uploadSessionId: jobData.uploadSessionId,
      fileName: outcome.fileName
    });
  }

  return outcome;
}

/** @alias buildWorkerRequest */
export const buildBatchContext = buildWorkerRequest;

export default { runStatementBatchJob, buildWorkerRequest, buildBatchContext, createPipelineOutcomeCollector };
