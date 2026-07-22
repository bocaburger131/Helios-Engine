/**
 * Vera AI — human-in-the-loop verification (HITL) state, triggers, signed PDF URLs.
 * @license Copyright (c) 2025 Shift 4 Financial INC
 */

import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import mongoose from 'mongoose';
import Statement from '../models/Statement.js';
import InstitutionalProfile from '../models/InstitutionalProfile.js';
import logger from '../utils/logger.js';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../utils/errors.js';
import {
  processTemplateOutcome,
  buildReconciliationMismatchAlert,
  resolveGraduationTemplateVersion
} from './templateGraduationService.js';

const PDF_URL_TTL_MS = 15 * 60 * 1000;

function signingSecret() {
  return process.env.VERA_PDF_SIGNING_SECRET || process.env.JWT_SECRET || 'your-secret-key';
}

function toUserObjectId(userId) {
  if (mongoose.Types.ObjectId.isValid(userId)) return new mongoose.Types.ObjectId(userId);
  throw new ValidationError('Invalid user id');
}

/**
 * @param {{ ok: boolean, delta?: string, computedClosing?: string, closing?: number, reason?: string }} checksumRecon
 * @param {number | null | undefined} geminiConfidence
 */
export function shouldTriggerVera({ checksumRecon, geminiConfidence }) {
  if (!checksumRecon?.ok) return true;
  if (geminiConfidence != null && Number.isFinite(Number(geminiConfidence)) && Number(geminiConfidence) < 0.8) {
    return true;
  }
  return false;
}

/**
 * @param {{ ok: boolean, delta?: string, computedClosing?: string, closing?: number }} checksumRecon
 * @param {number | null | undefined} geminiConfidence
 */
export function buildMismatchDetails(checksumRecon, geminiConfidence) {
  const parts = [];
  if (checksumRecon && !checksumRecon.ok) {
    const deltaNum = parseFloat(checksumRecon.delta || '0');
    const abs = Math.abs(deltaNum);
    parts.push(
      `Checksum off by $${abs.toFixed(2)} (computed closing $${checksumRecon.computedClosing} vs statement closing $${Number(checksumRecon.closing).toFixed(2)}).`
    );
  }
  if (geminiConfidence != null && Number.isFinite(Number(geminiConfidence)) && Number(geminiConfidence) < 0.8) {
    parts.push(`Gemini layout confidence ${Number(geminiConfidence).toFixed(2)} is below 0.80 threshold.`);
  }
  return parts.join(' ') || 'Manual verification required.';
}

export function stripParseForStorage(pr) {
  if (!pr || typeof pr !== 'object') return pr;
  const { rawText, ...rest } = pr;
  return rest;
}

/**
 * @param {string} statementId
 * @param {string} userId
 * @returns {string} base64url token
 */
export function createVeraPdfToken(statementId, userId) {
  const exp = Date.now() + PDF_URL_TTL_MS;
  const sig = crypto
    .createHmac('sha256', signingSecret())
    .update(`${statementId}:${userId}:${exp}`)
    .digest('hex');
  return Buffer.from(JSON.stringify({ statementId, userId, exp, sig }), 'utf8').toString('base64url');
}

/**
 * @param {string} token
 * @returns {{ ok: boolean, statementId?: string, userId?: string }}
 */
export function verifyVeraPdfToken(token) {
  try {
    const raw = Buffer.from(String(token || ''), 'base64url').toString('utf8');
    const obj = JSON.parse(raw);
    if (!obj.statementId || !obj.userId || !obj.exp || !obj.sig) return { ok: false };
    if (Date.now() > Number(obj.exp)) return { ok: false };
    const expected = crypto
      .createHmac('sha256', signingSecret())
      .update(`${obj.statementId}:${obj.userId}:${obj.exp}`)
      .digest('hex');
    if (obj.sig !== expected) return { ok: false };
    return { ok: true, statementId: String(obj.statementId), userId: String(obj.userId) };
  } catch {
    return { ok: false };
  }
}

/**
 * @param {import('express').Request} req
 * @param {string} statementId
 * @param {string} userId
 */
export function buildPdfSignedUrl(req, statementId, userId) {
  const base =
    process.env.PUBLIC_API_BASE_URL ||
    `${req.protocol}://${req.get('host') || 'localhost'}`;
  const token = createVeraPdfToken(statementId, userId);
  return `${base.replace(/\/$/, '')}/api/statements/${statementId}/file?veraToken=${encodeURIComponent(token)}`;
}

/**
 * Normalize layout header anchors for Vera UI (tableStart / tableEnd).
 * @param {object | null | undefined} raw
 * @returns {{ tableStart: string, tableEnd: string }}
 */
export function normalizeVeraHeaderAnchors(raw) {
  if (!raw || typeof raw !== 'object') {
    return { tableStart: '', tableEnd: '' };
  }
  return {
    tableStart: String(raw.tableStart ?? raw.start ?? raw.table_start ?? '').trim(),
    tableEnd: String(raw.tableEnd ?? raw.end ?? raw.table_end ?? '').trim()
  };
}

/**
 * Resolve headerAnchors for Vera PDF auto-scroll from institutional template or parse metadata.
 * @param {object} statementDoc lean statement document
 * @returns {Promise<{ tableStart: string, tableEnd: string }>}
 */
export async function resolveVeraHeaderAnchorsForStatement(statementDoc) {
  const metaVera = statementDoc?.metadata?.vera || {};
  const rtn = String(metaVera.rtn || '').replace(/\D/g, '');
  let templateVersion = metaVera.graduationTemplateVersion;

  const pickFromProfile = (profile) => {
    if (!profile?.templates?.length) return null;
    const version =
      templateVersion != null && Number.isFinite(Number(templateVersion))
        ? Number(templateVersion)
        : resolveGraduationTemplateVersion(profile.templates);
    if (version == null) return null;
    const tpl = profile.templates.find((t) => t.version === version);
    const anchors = tpl?.mapping?.headerAnchors;
    if (anchors && typeof anchors === 'object') return normalizeVeraHeaderAnchors(anchors);
    return null;
  };

  if (rtn.length === 9) {
    const byRtn = await InstitutionalProfile.findOne({ routingNumber: rtn }).lean();
    const fromRtn = pickFromProfile(byRtn);
    if (fromRtn?.tableStart) return fromRtn;
  }

  if (statementDoc?.institutionalProfileId) {
    const byId = await InstitutionalProfile.findById(statementDoc.institutionalProfileId).lean();
    const fromId = pickFromProfile(byId);
    if (fromId?.tableStart) return fromId;
  }

  const initialParse = statementDoc?.parsedData?.initialParse;
  if (initialParse?.headerAnchors) {
    const fromParse = normalizeVeraHeaderAnchors(initialParse.headerAnchors);
    if (fromParse.tableStart) return fromParse;
  }

  const origMeta = statementDoc?.veraVerification?.originalAiData?.metadata;
  if (origMeta?.headerAnchors) {
    return normalizeVeraHeaderAnchors(origMeta.headerAnchors);
  }

  return { tableStart: '', tableEnd: '' };
}

/**
 * @param {object} params
 * @returns {Promise<import('mongoose').Document>}
 */
export async function persistVeraQueueStatement(params) {
  const {
    userId,
    uploadId,
    parseResult,
    filePath,
    fileUrl,
    originalName,
    fileName,
    mimetype,
    size,
    checksumRecon,
    geminiConfidence,
    rtn,
    graduationTemplateVersion,
    institutionalProfileId
  } = params;

  const checksumAlert =
    checksumRecon && !checksumRecon.ok ? buildReconciliationMismatchAlert(checksumRecon) : null;
  const mismatchDetails = buildMismatchDetails(checksumRecon, geminiConfidence);
  const cleanedRtn = rtn ? String(rtn).replace(/\D/g, '') : '';

  const opening =
    typeof parseResult?.openingBalance === 'number'
      ? parseResult.openingBalance
      : parseResult?.balances?.opening ?? 0;
  const closing =
    typeof parseResult?.closingBalance === 'number'
      ? parseResult.closingBalance
      : parseResult?.balances?.closing ?? 0;

  const txs = Array.isArray(parseResult?.transactions) ? parseResult.transactions : [];
  const originalAiData = {
    openingBalance: opening,
    closingBalance: closing,
    transactionCount: txs.length,
    bankName: parseResult?.bankName || parseResult?.accountInfo?.bankName || null,
    metadata: parseResult?.metadata || {},
    balances: parseResult?.balances || {},
    summarySlice: {
      totalDeposits: checksumRecon?.deposits,
      totalWithdrawals: checksumRecon?.withdrawals
    }
  };

  const uid = mongoose.Types.ObjectId.isValid(userId) ? new mongoose.Types.ObjectId(userId) : userId;

  const doc = await Statement.create({
    user: uid,
    userId: uid,
    uploadId,
    originalName: originalName || fileName,
    fileName: fileName || originalName,
    fileUrl: fileUrl || filePath || '',
    filePath: filePath || null,
    bankName: parseResult?.bankName || parseResult?.accountInfo?.bankName || 'Unknown Bank',
    accountNumber: parseResult?.accountNumber || parseResult?.accountInfo?.accountNumber || 'UNKNOWN',
    statementDate: extractStatementDateFromParse(parseResult) || new Date(),
    uploadDate: new Date(),
    institutionalProfileId: institutionalProfileId || null,
    openingBalance: opening,
    closingBalance: closing,
    transactionCount: txs.length,
    status: 'NEEDS_HUMAN_VERIFICATION',
    parsedData: { initialParse: stripParseForStorage(parseResult) },
    alerts: checksumAlert ? [checksumAlert] : [],
    metadata: {
      mimetype: mimetype || 'application/pdf',
      size: size || 0,
      originalName: originalName || fileName,
      vera: {
        rtn: cleanedRtn,
        graduationTemplateVersion:
          graduationTemplateVersion != null && Number.isFinite(graduationTemplateVersion)
            ? graduationTemplateVersion
            : null,
        deferredNegativeGraduation: true
      }
    },
    veraVerification: {
      originalAiData,
      mismatchDetails,
      geminiConfidence: geminiConfidence != null && Number.isFinite(Number(geminiConfidence)) ? Number(geminiConfidence) : null,
      triggeredAt: new Date(),
      verificationData: {}
    }
  });

  return doc;
}

/**
 * Put an existing statement (e.g. template-learning partial row) into Vera hold.
 * @param {object} params
 */
export async function applyVeraHoldOnStatement(params) {
  const { statementId, parseResult, checksumRecon, geminiConfidence, rtn, graduationTemplateVersion, jobId } = params;

  const checksumAlert =
    checksumRecon && !checksumRecon.ok ? buildReconciliationMismatchAlert(checksumRecon) : null;
  const mismatchDetails = buildMismatchDetails(checksumRecon, geminiConfidence);
  const cleanedRtn = rtn ? String(rtn).replace(/\D/g, '') : '';

  const opening =
    typeof parseResult?.openingBalance === 'number'
      ? parseResult.openingBalance
      : parseResult?.balances?.opening ?? 0;
  const closing =
    typeof parseResult?.closingBalance === 'number'
      ? parseResult.closingBalance
      : parseResult?.balances?.closing ?? 0;
  const txs = Array.isArray(parseResult?.transactions) ? parseResult.transactions : [];
  const originalAiData = {
    openingBalance: opening,
    closingBalance: closing,
    transactionCount: txs.length,
    bankName: parseResult?.bankName || parseResult?.accountInfo?.bankName || null,
    metadata: parseResult?.metadata || {},
    balances: parseResult?.balances || {},
    summarySlice: {
      totalDeposits: checksumRecon?.deposits,
      totalWithdrawals: checksumRecon?.withdrawals
    }
  };

  const gradV =
    graduationTemplateVersion != null && Number.isFinite(graduationTemplateVersion)
      ? graduationTemplateVersion
      : null;

  const $set = {
    status: 'NEEDS_HUMAN_VERIFICATION',
    openingBalance: opening,
    closingBalance: closing,
    transactionCount: txs.length,
    parsedData: {
      parseResultAfterTemplate: {
        success: parseResult?.success,
        metadata: parseResult?.metadata,
        bankName: parseResult?.bankName,
        transactions: txs
      }
    },
    'metadata.templateLearning.status': 'complete',
    'metadata.templateLearning.completedAt': new Date(),
    'metadata.templateLearning.jobId': jobId != null ? String(jobId) : '',
    'metadata.templateLearning.failedReason': '',
    'metadata.vera': {
      rtn: cleanedRtn,
      graduationTemplateVersion: gradV,
      deferredNegativeGraduation: true
    },
    veraVerification: {
      originalAiData,
      mismatchDetails,
      geminiConfidence:
        geminiConfidence != null && Number.isFinite(Number(geminiConfidence)) ? Number(geminiConfidence) : null,
      triggeredAt: new Date(),
      verificationData: {}
    }
  };

  const q = { _id: mongoose.Types.ObjectId.isValid(statementId) ? new mongoose.Types.ObjectId(statementId) : statementId };
  if (checksumAlert) {
    await Statement.updateOne(q, { $set, $push: { alerts: checksumAlert } });
  } else {
    await Statement.updateOne(q, { $set });
  }
}

function extractStatementDateFromParse(parseResult) {
  const txs = parseResult?.transactions;
  if (!Array.isArray(txs) || txs.length === 0) return null;
  let latest = null;
  for (const t of txs) {
    const d = t?.date ? new Date(t.date) : null;
    if (d && !Number.isNaN(d.getTime())) {
      if (!latest || d > latest) latest = d;
    }
  }
  return latest;
}

/**
 * Resolve absolute path for a statement PDF on disk (same rules as downloadStatement).
 * @param {{ fileUrl?: string }} statement
 */
export function resolveStatementPdfAbsolutePath(statement) {
  const fileUrl = statement?.fileUrl;
  if (!fileUrl || String(fileUrl).startsWith('memory://')) return null;
  const absolutePath = path.isAbsolute(fileUrl) ? fileUrl : path.resolve(process.cwd(), fileUrl);
  if (!fs.existsSync(absolutePath)) return null;
  return absolutePath;
}

/**
 * @param {string} statementId
 * @param {string} actorUserId
 * @param {{ openingBalance: number, closingBalance: number, totalDeposits: number, totalWithdrawals: number }} body
 */
export async function completeHumanVerification(statementId, actorUserId, body) {
  if (!mongoose.Types.ObjectId.isValid(statementId)) {
    throw new ValidationError('Invalid statement ID format');
  }

  const { openingBalance, closingBalance, totalDeposits, totalWithdrawals } = body || {};
  const nums = [openingBalance, closingBalance, totalDeposits, totalWithdrawals];
  for (const n of nums) {
    if (typeof n !== 'number' || !Number.isFinite(n)) {
      throw new ValidationError('openingBalance, closingBalance, totalDeposits, and totalWithdrawals must be finite numbers');
    }
  }

  const statement = await Statement.findById(statementId);
  if (!statement) {
    throw new NotFoundError('Statement not found or access denied');
  }

  const statementOwner = (statement.userId || statement.user)?.toString();
  const actorStr = String(actorUserId || '');
  if (statementOwner && actorStr && statementOwner !== actorStr) {
    throw new ForbiddenError('Statement not found or access denied');
  }

  if (String(statement.status).toUpperCase() !== 'NEEDS_HUMAN_VERIFICATION') {
    throw new ConflictError('Statement is not awaiting human verification');
  }

  const uid = toUserObjectId(actorStr);
  const rtn = statement.metadata?.vera?.rtn || '';
  const version = statement.metadata?.vera?.graduationTemplateVersion;

  statement.openingBalance = openingBalance;
  statement.closingBalance = closingBalance;
  statement.status = 'COMPLETED';
  statement.processedDate = new Date();
  const prevVera =
    statement.veraVerification && typeof statement.veraVerification === 'object'
      ? statement.veraVerification.toObject?.() ?? { ...statement.veraVerification }
      : {};
  statement.veraVerification = {
    ...prevVera,
    verificationData: { openingBalance, closingBalance, totalDeposits, totalWithdrawals },
    veraVerifiedBy: uid,
    veraVerifiedAt: new Date()
  };
  const prevAnalytics =
    statement.analytics && typeof statement.analytics === 'object'
      ? statement.analytics.toObject?.() ?? { ...statement.analytics }
      : {};
  statement.analytics = {
    ...prevAnalytics,
    totalDeposits,
    totalWithdrawals
  };
  statement.alerts = (statement.alerts || []).filter((a) => a.code !== 'RECONCILIATION_MISMATCH');
  statement.markModified('veraVerification');
  statement.markModified('analytics');
  statement.markModified('alerts');

  await statement.save();

  const cleanedRtn = String(rtn).replace(/\D/g, '');
  if (cleanedRtn.length === 9) {
    try {
      await InstitutionalProfile.updateOne(
        { routingNumber: cleanedRtn },
        { $set: { manuallyVerified: true } }
      );
    } catch (profErr) {
      logger.warn({
        msg: '[VERA_RESOLVED] InstitutionalProfile manuallyVerified update failed',
        service: 'bank-statement-analyzer',
        timestamp: new Date().toISOString(),
        statementId,
        rtn: cleanedRtn,
        error: profErr.message
      });
    }
  }
  if (cleanedRtn.length === 9 && version != null && Number.isFinite(version)) {
    try {
      await processTemplateOutcome(cleanedRtn, version, true, { lastError: undefined });
    } catch (e) {
      logger.warn({
        msg: '[VERA_RESOLVED] template graduation follow-up failed',
        service: 'bank-statement-analyzer',
        timestamp: new Date().toISOString(),
        statementId,
        error: e.message
      });
    }
  }

  logger.info({
    msg: `[VERA_RESOLVED] Statement ${statementId} verified by ${actorStr}. Template streak updated.`,
    service: 'bank-statement-analyzer',
    timestamp: new Date().toISOString(),
    statementId,
    userId: actorStr,
    rtn: cleanedRtn || undefined,
    version: version ?? undefined
  });

  return statement.toObject ? statement.toObject() : statement;
}

/**
 * Attach Vera paywall guidance when state registry credentials are required.
 * @param {object} sosData
 * @returns {object|null}
 */
export function buildRegistryCredentialRequest(sosData) {
  if (!sosData || sosData.alertCode !== 'SOS_CREDENTIALS_REQUIRED') {
    if (sosData?.reason !== 'SOS_CREDENTIALS_REQUIRED') return null;
  }
  return {
    stateCode: sosData.state,
    portalSignupUrl: sosData.portalSignupUrl || null,
    message:
      'This state registry requires portal credentials. Use Vera to add credits or create an account, then retry verification.',
    requestedAt: new Date().toISOString()
  };
}
