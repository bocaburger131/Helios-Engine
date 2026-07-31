/**
 * Bull job processor: Gemini layout learn + re-parse + Statement patch.
 * @license Copyright (c) 2025 Shift 4 Financial INC
 */

import fs from 'fs/promises';
import mongoose from 'mongoose';
import InstitutionalProfile from '../models/InstitutionalProfile.js';
import Statement from '../models/Statement.js';
import pdfParserService from '../services/pdfParserService.js';
import { identifyTemplate } from '../services/templateLearningService.js';
import logger from '../utils/logger.js';
import {
  buildLayoutFingerprint
} from '../services/extraction/layoutFingerprintService.js';
import {
  validateReconciliation,
  processTemplateOutcome,
  buildReconciliationMismatchAlert
} from '../services/templateGraduationService.js';
import { shouldTriggerVera, applyVeraHoldOnStatement } from '../services/veraVerificationService.js';
import { triageLayoutMismatch, createRelationship } from '../services/institutionTriageService.js';
import { enqueueTemplateLearningJob } from '../services/templateLearningQueue.js';
/**
 * @param {import('bull').Job} job
 */
export async function processTemplateLearningJob(job) {
  const { filePath, rtn, institutionalProfileId, statementId, anchorData = {} } = job.data;

  if (!filePath || !rtn || !institutionalProfileId || !statementId) {
    throw new Error('template-learning job missing filePath, rtn, institutionalProfileId, or statementId');
  }

  const buffer = await fs.readFile(filePath);

  // ── Template Evolution Detection ──
  // Before learning: check if this statement belongs to a different institution
  const triageProfile = await InstitutionalProfile.findById(institutionalProfileId).lean();
  if (triageProfile) {
    // Extract initial layout data from the PDF to build fingerprint
    // Use a lightweight extraction first
    const { default: pdfParse } = await import('pdf-parse');
    let extractedText = '';
    try {
      const pdfData = await pdfParse(buffer);
      extractedText = pdfData.text || '';
    } catch { /* ignore parse errors at triage stage */ }

    // Build a preliminary fingerprint from the extracted text
    // Look for section-like patterns (all-caps headers common in bank statements)
    const sectionPattern = /^[A-Z][A-Z\s\/&]{3,40}$/gm;
    const sectionLabels = (extractedText.match(sectionPattern) || [])
      .map(s => s.trim())
      .filter(s => s.length > 3);

    const incomingFp = buildLayoutFingerprint({
      headerAnchors: {},
      transactionSections: sectionLabels.map(l => ({ label: l }))
    });

    if (incomingFp && triageProfile.templates?.length > 0) {
      const triageResult = await triageLayoutMismatch({
        incomingFingerprint: incomingFp,
        expectedProfileId: triageProfile._id,
        expectedProfileRtn: rtn,
        expectedProfileName: triageProfile.legalName,
        parsedBankName: anchorData?.companyName || '',
        incomingSectionLabels: sectionLabels,
        existingTemplateVersion: triageProfile.templates[0]?.version || 1,
        existingTemplateFingerprint: triageProfile.templates[0]?.fingerprint || ''
      });

      if (triageResult.action === 'WRONG_INSTITUTION' && triageResult.targetProfileId) {
        logger.warn('[LEARNING] Triage: WRONG_INSTITUTION — re-routing learning job', {
          from: triageProfile.legalName,
          to: triageResult.targetProfileName,
          reason: triageResult.reason
        });
        await createRelationship(triageProfile._id, {
          type: triageResult.relationshipType,
          targetProfileId: triageResult.targetProfileId,
          confidence: 0.9
        });
        // Re-queue the job under the correct profile
        const correctProfile = await InstitutionalProfile.findById(triageResult.targetProfileId).lean();
        if (correctProfile) {
          await enqueueTemplateLearningJob({
            filePath,
            rtn: correctProfile.routingNumber,
            institutionalProfileId: String(correctProfile._id),
            statementId: String(statementId),
            anchorData,
            fileHash: job.data.fileHash
          });
          // Update statement to point to correct profile
          await Statement.findByIdAndUpdate(statementId, {
            $set: { institutionalProfileId: correctProfile._id }
          });
          return { ok: true, statementId: String(statementId), rerouted: true, to: correctProfile.legalName };
        }
      }

      if (triageResult.action === 'FORMAT_CHANGE') {
        logger.warn('[LEARNING] Triage: FORMAT_CHANGE — learning variant', {
          profile: triageProfile.legalName,
          parentVersion: triageResult.parentTemplateVersion,
          reason: triageResult.reason
        });
        // Continue with Gemini learning — pass parentTemplateVersion
        job.data.parentTemplateVersion = triageResult.parentTemplateVersion;
      }
    }
  }

  await Statement.findByIdAndUpdate(statementId, {
    $set: {
      'metadata.templateLearning.status': 'processing',
      'metadata.templateLearning.jobId': String(job.id)
    }
  });

  const mapping = await identifyTemplate(buffer, rtn, {
    statementId: String(statementId),
    jobId: String(job.id)
  });
  const { layoutConfidence: _omitLc, ...mappingForTemplate } = mapping;
  const fingerprint = mapping.layoutFingerprint || buildLayoutFingerprint(mapping);

  const profile = await InstitutionalProfile.findById(institutionalProfileId);
  if (!profile) {
    throw new Error('InstitutionalProfile not found');
  }

  const maxVersion = Math.max(
    0,
    ...(profile.templates || []).map((t) => (Number.isFinite(t.version) ? t.version : 0))
  );
  const nextVersion = maxVersion + 1;

  await InstitutionalProfile.updateOne(
    { _id: institutionalProfileId },
    {
      $push: {
        templates: {
          version: nextVersion,
          status: 'LEARNING',
          consecutiveSuccesses: 0,
          totalProcessed: 0,
          layoutConfidence: mapping.layoutConfidence ?? null,
          fingerprint,
          parentTemplateVersion: job.data.parentTemplateVersion || null,
          mapping: mappingForTemplate
        }
      }
    }
  );

  const refreshed = await InstitutionalProfile.findById(institutionalProfileId).lean();
  const templates = refreshed?.templates || [];
  const manuallyVerified = Boolean(refreshed?.manuallyVerified);
  const verifiedTpl = templates.find((t) => t.status === 'VERIFIED');
  const learningSorted = templates
    .filter((t) => t.status === 'LEARNING')
    .sort((a, b) => (b.version || 0) - (a.version || 0));
  const layoutTemplate = manuallyVerified
    ? verifiedTpl?.mapping || learningSorted[0]?.mapping || mappingForTemplate
    : mappingForTemplate;

  const secondParse = await pdfParserService.parseStatement(buffer, {
    ...anchorData,
    layoutTemplate
  });

  if (!secondParse?.success || !Array.isArray(secondParse.transactions) || secondParse.transactions.length === 0) {
    throw new Error('Re-parse with layout template produced no transactions');
  }

  const opening =
    typeof secondParse.openingBalance === 'number'
      ? secondParse.openingBalance
      : secondParse.balances?.opening ?? 0;
  const closing =
    typeof secondParse.closingBalance === 'number'
      ? secondParse.closingBalance
      : secondParse.balances?.closing ?? 0;

  const checksumRecon = validateReconciliation(secondParse);
  const geminiConfidence =
    mapping.layoutConfidence ??
    learningSorted[0]?.layoutConfidence ??
    learningSorted[0]?.mapping?.layoutConfidence ??
    null;
  const triggerVera = shouldTriggerVera({ checksumRecon, geminiConfidence });

  const cleanedRtn = String(rtn || '').replace(/\D/g, '');
  const graduationVersion = verifiedTpl ? verifiedTpl.version : nextVersion;

  if (triggerVera) {
    await applyVeraHoldOnStatement({
      statementId,
      parseResult: secondParse,
      checksumRecon,
      geminiConfidence,
      rtn: cleanedRtn,
      graduationTemplateVersion: graduationVersion,
      jobId: String(job.id)
    });
    logger.warn({
      msg: `[VERA_TRIGGER] Statement ${statementId} failed checksum or low confidence. Moving to manual queue.`,
      service: 'bank-statement-analyzer',
      timestamp: new Date().toISOString(),
      statementId: String(statementId),
      jobId: String(job.id),
      checksumOk: checksumRecon.ok,
      geminiConfidence
    });
    logger.info({
      msg: '[LEARNING] Worker stopped after re-parse — Vera human verification required',
      service: 'bank-statement-analyzer',
      timestamp: new Date().toISOString(),
      statementId: String(statementId),
      jobId: String(job.id),
      headerAnchors: mapping?.headerAnchors
    });
    return { ok: true, statementId: String(statementId), veraHold: true, transactionCount: secondParse.transactions.length };
  }

  if (cleanedRtn.length === 9 && secondParse.metadata?.usedLayoutTemplate) {
    await processTemplateOutcome(cleanedRtn, graduationVersion, checksumRecon.ok, {
      lastError: checksumRecon.reason
    });
  }

  const checksumAlert = checksumRecon.ok ? null : buildReconciliationMismatchAlert(checksumRecon);

  await Statement.findByIdAndUpdate(statementId, {
    ...(checksumAlert ? { $push: { alerts: checksumAlert } } : {}),
    $set: {
      parsedData: {
        parseResultAfterTemplate: {
          success: secondParse.success,
          metadata: secondParse.metadata,
          bankName: secondParse.bankName,
          transactions: secondParse.transactions
        }
      },
      transactionCount: secondParse.transactions.length,
      openingBalance: opening,
      closingBalance: closing,
      'metadata.templateLearning.status': 'complete',
      'metadata.templateLearning.completedAt': new Date(),
      'metadata.templateLearning.jobId': String(job.id),
      'metadata.templateLearning.failedReason': ''
    }
  });

  logger.info({
    msg: '[LEARNING] Worker completed template learn + re-parse',
    service: 'bank-statement-analyzer',
    timestamp: new Date().toISOString(),
    statementId: String(statementId),
    jobId: String(job.id),
    headerAnchors: mapping?.headerAnchors
  });

  return { ok: true, statementId: String(statementId), transactionCount: secondParse.transactions.length };
}

export async function processTemplateLearningJobSafe(job) {
  try {
    return await processTemplateLearningJob(job);
  } catch (err) {
    logger.warn({
      msg: '[LEARNING] Worker job failed',
      service: 'bank-statement-analyzer',
      timestamp: new Date().toISOString(),
      jobId: String(job.id),
      error: err.message
    });
    if (job.data?.statementId && mongoose.Types.ObjectId.isValid(job.data.statementId)) {
      await Statement.findByIdAndUpdate(job.data.statementId, {
        $set: {
          'metadata.templateLearning.status': 'failed',
          'metadata.templateLearning.failedReason': err.message,
          'metadata.templateLearning.completedAt': new Date()
        }
      });
    }
    throw err;
  }
}
