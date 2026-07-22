/**
 * Human-in-the-loop layout rescue for UNKNOWN_LAYOUT / AI quality failures.
 * Independent of automatic one-shot Gemini; max attempts via circuit breaker.
 */
import fs from 'fs/promises';
import path from 'path';
import logger from '../../utils/logger.js';
import Statement from '../../models/Statement.js';
import {
  beginHumanRescueAttempt,
  recordAiQualityFailure,
  buildEscapeHatch
} from './geminiCircuitBreaker.js';
import { withLayoutFingerprint } from './layoutFingerprintService.js';
import { buildParseManifest, buildReviewPacket, PARSER_VERSION } from './parseManifest.js';

const MAX_MAPPING_KEYS = 40;

/**
 * @param {object} mapping
 * @returns {boolean}
 */
function looksLikeLayoutMapping(mapping) {
  if (!mapping || typeof mapping !== 'object') return false;
  return Boolean(
    mapping.headerAnchors ||
      mapping.transactionSections ||
      mapping.columnMapping ||
      mapping.layoutFingerprint
  );
}

/**
 * Resolve absolute PDF path for a statement (same heuristics as Vera file serve).
 * @param {object} statement
 * @returns {Promise<string|null>}
 */
async function resolvePdfPath(statement) {
  const candidates = [
    statement.filePath,
    statement.originalFilePath,
    statement.metadata?.filePath,
    statement.localPath
  ].filter(Boolean);
  for (const p of candidates) {
    try {
      await fs.access(p);
      return p;
    } catch {
      /* try next */
    }
  }
  if (statement.fileName) {
    const uploads = path.join(process.cwd(), 'uploads', statement.fileName);
    try {
      await fs.access(uploads);
      return uploads;
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * Apply human-edited mapping or force a fresh AI teach (caller supplies teachFn).
 *
 * @param {object} input
 * @param {string} input.statementId
 * @param {string} input.userId
 * @param {object} [input.mapping] — human-edited layout mapping
 * @param {boolean} [input.forceAi] — request another AI teach (bypasses auto one-shot)
 * @param {(buffer: Buffer, ctx: object) => Promise<object|null>} [input.teachFn]
 * @returns {Promise<object>}
 */
export async function runLayoutRescue(input = {}) {
  const { statementId, userId, mapping, forceAi = false, teachFn } = input;
  if (!statementId) {
    const err = new Error('statementId required');
    err.statusCode = 400;
    throw err;
  }

  const statement = await Statement.findById(statementId);
  if (!statement) {
    const err = new Error('Statement not found');
    err.statusCode = 404;
    throw err;
  }

  const owner = (statement.userId || statement.user)?.toString();
  if (owner && userId && owner !== userId.toString()) {
    const err = new Error('Access denied');
    err.statusCode = 403;
    throw err;
  }

  const docKey = String(statementId);
  const begin = beginHumanRescueAttempt(docKey);
  if (!begin.allowed) {
    const err = new Error(
      `Human layout rescue exhausted (${begin.attempt}/${begin.max})`
    );
    err.statusCode = 429;
    err.code = 'HUMAN_RESCUE_EXHAUSTED';
    throw err;
  }

  statement.metadata = statement.metadata || {};
  const prior = statement.metadata.aiLayoutAttempt || {};

  let appliedMapping = null;
  let source = null;

  if (mapping && looksLikeLayoutMapping(mapping)) {
    appliedMapping = withLayoutFingerprint(mapping, {
      profileVersion: mapping.profileVersion || `hitl-${begin.attempt}`
    });
    source = 'human_mapping';
  } else if (forceAi && typeof teachFn === 'function') {
    const pdfPath = await resolvePdfPath(statement);
    if (!pdfPath) {
      const err = new Error('PDF file not available for layout rescue');
      err.statusCode = 404;
      throw err;
    }
    const buffer = await fs.readFile(pdfPath);
    try {
      const taught = await teachFn(buffer, {
        statementId,
        rtn: statement.routingNumber || statement.metadata?.rtn,
        bankName: statement.bankName,
        forceHumanRescue: true
      });
      if (!taught || !looksLikeLayoutMapping(taught)) {
        recordAiQualityFailure(docKey, { reason: 'hitl_ai_returned_invalid_mapping' });
        const err = new Error('AI layout rescue returned invalid mapping');
        err.statusCode = 422;
        err.code = 'AI_LAYOUT_FAILED';
        throw err;
      }
      appliedMapping = withLayoutFingerprint(taught);
      source = 'human_forced_ai';
    } catch (e) {
      if (e.statusCode) throw e;
      recordAiQualityFailure(docKey, { reason: String(e.message || e) });
      const err = new Error(`AI layout rescue failed: ${e.message || e}`);
      err.statusCode = 502;
      err.code = 'AI_LAYOUT_FAILED';
      throw err;
    }
  } else {
    const err = new Error(
      'Provide mapping JSON or forceAi:true with teach capability'
    );
    err.statusCode = 400;
    throw err;
  }

  // Cap mapping size for Mongo safety
  const keys = Object.keys(appliedMapping || {});
  if (keys.length > MAX_MAPPING_KEYS * 5) {
    logger.warn('[LAYOUT_RESCUE] Large mapping; storing as-is', { keys: keys.length });
  }

  statement.metadata.layoutRescue = {
    at: new Date().toISOString(),
    attempt: begin.attempt,
    maxAttempts: begin.max,
    source,
    userId: userId || null
  };
  statement.metadata.aiLayoutAttempt = {
    ...prior,
    at: new Date().toISOString(),
    resultOk: true,
    mappingVersionAttempted: appliedMapping.profileVersion || appliedMapping.layoutFingerprint,
    humanRescue: true
  };
  statement.metadata.rescuedLayoutMapping = appliedMapping;
  statement.metadata.parseFinalStatus = 'LAYOUT_RESCUE_APPLIED';
  statement.metadata.reviewPacket = buildReviewPacket({
    failureClass: 'UNKNOWN_LAYOUT',
    finalStatus: 'LAYOUT_RESCUE_APPLIED',
    candidates: [],
    missingSections: []
  });
  statement.metadata.reviewPacket.escapeHatch = buildEscapeHatch(statementId);
  statement.metadata.reviewPacket.recommendedNextAction = 'reparse_with_rescued_layout';
  statement.metadata.parseManifest = buildParseManifest({
    documentClass: statement.metadata.documentClass || null,
    finalStatus: 'LAYOUT_RESCUE_APPLIED',
    selectedEngine: null,
    repairApplied: 'human_layout_rescue',
    repairs: [{ action: 'human_layout_rescue', attempt: begin.attempt }],
    profileId: statement.metadata.extractionProfile || null,
    profileVersion: appliedMapping.profileVersion || null,
    parserVersion: PARSER_VERSION
  });

  statement.markModified('metadata');
  await statement.save();

  logger.info('[LAYOUT_RESCUE] Applied', {
    statementId,
    source,
    attempt: begin.attempt
  });

  return {
    statementId,
    attempt: begin.attempt,
    maxAttempts: begin.max,
    source,
    parseFinalStatus: 'LAYOUT_RESCUE_APPLIED',
    escapeHatch: buildEscapeHatch(statementId),
    mappingFingerprint: appliedMapping.layoutFingerprint || null,
    message:
      'Layout rescue stored. Re-run parse/batch with rescuedLayoutMapping as layoutTemplate hint.'
  };
}

export default { runLayoutRescue, looksLikeLayoutMapping };
