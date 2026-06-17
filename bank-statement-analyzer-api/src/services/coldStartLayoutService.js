/**
 * Cold-start layout learning: Gemini vision → InstitutionalProfile LEARNING template → re-parse.
 * Shared by single-upload, batch macro, and Bull template-learning worker.
 */
import pdfParserService from './pdfParserService.js';
import { identifyTemplate } from './templateLearningService.js';
import { learnTemplateLayout, coerceLayoutMapping } from './llm/aiLayoutService.js';
import { getLatestLearnableTemplate, persistLearningTemplate } from './institutionalTemplatePersist.js';
import { processTemplateOutcome, validateReconciliation } from './templateGraduationService.js';
import { clearVisionLayoutCacheForRtn } from './visionLayoutCacheService.js';
import { extractTypeBTextFromBuffer } from './extraction/templateDigitalValidator.js';
import { buildReconciliationSpecFromSummaryLabels } from './extraction/reconciliationSpec.js';
import logger from '../utils/logger.js';

export function coldStartLayoutSyncEnabled() {
  if (process.env.COLD_START_LAYOUT_SYNC === 'false') return false;
  return process.env.COLD_START_LAYOUT_SYNC === 'true' || process.env.NODE_ENV !== 'production';
}

/**
 * @param {object|null|undefined} profileDoc
 * @returns {boolean}
 */
export function hasVerifiedTemplate(profileDoc) {
  return (profileDoc?.templates || []).some(
    (t) => String(t.status || '').toUpperCase() === 'VERIFIED'
  );
}

/**
 * Attach dynamic reconciliationSpec from vision summaryLineLabels when present.
 * @param {object} mapping
 * @returns {object}
 */
export function enrichMappingWithReconciliationSpec(mapping) {
  if (!mapping || typeof mapping !== 'object') return mapping;
  if (mapping.reconciliationSpec) return mapping;
  const spec = buildReconciliationSpecFromSummaryLabels(mapping.summaryLineLabels);
  if (!spec) return mapping;
  return { ...mapping, reconciliationSpec: spec };
}

/**
 * Learn layout via Gemini vision and persist LEARNING template on profile.
 * @param {object} params
 * @param {Buffer} params.buffer
 * @param {string} [params.rtn]
 * @param {import('mongoose').Types.ObjectId|string} params.profileId
 * @param {string} [params.bankName]
 * @param {number|null} [params.printedOpeningBalance]
 * @param {number|null} [params.printedClosingBalance]
 * @param {string} [params.digitalTextExcerpt]
 * @param {object} [params.visionOptions]
 * @returns {Promise<{ mapping: object, version: number, layoutConfidence: number|null }|null>}
 */
export async function learnAndPersistLayout(params = {}) {
  const {
    buffer,
    rtn,
    profileId,
    bankName,
    printedOpeningBalance,
    printedClosingBalance,
    digitalTextExcerpt,
    visionOptions = {}
  } = params;

  if (!buffer?.length || !profileId) return null;

  const cleanedRtn = String(rtn || '').replace(/\D/g, '');
  if (cleanedRtn.length === 9) {
    await clearVisionLayoutCacheForRtn(cleanedRtn);
  }

  let raw;
  try {
    raw = await learnTemplateLayout(buffer, {
      rtn: cleanedRtn || undefined,
      bankName,
      printedOpeningBalance,
      printedClosingBalance,
      digitalTextExcerpt
    });
  } catch (err) {
    logger.warn('[COLD_START] learnTemplateLayout failed', { error: err.message });
    try {
      raw = await identifyTemplate(buffer, cleanedRtn || '000000000', visionOptions);
    } catch (identifyErr) {
      logger.warn('[COLD_START] identifyTemplate fallback failed', { error: identifyErr.message });
      return null;
    }
  }

  let mapping = coerceLayoutMapping(raw);
  if (!mapping) return null;
  mapping = enrichMappingWithReconciliationSpec(mapping);

  const persisted = await persistLearningTemplate(profileId, mapping, {
    layoutConfidence: mapping.layoutConfidence ?? null
  });
  if (!persisted) return null;

  return {
    mapping,
    version: persisted.version,
    layoutConfidence: mapping.layoutConfidence ?? null
  };
}

/**
 * Re-parse PDF with learned layout template.
 * @param {object} params
 * @returns {Promise<object|null>}
 */
export async function reparseWithLayoutTemplate(params = {}) {
  const {
    buffer,
    layoutTemplate,
    anchorData = {},
    fileName,
    bankName,
    parserService = pdfParserService,
    templateHintMeta = null
  } = params;

  if (!buffer?.length || !layoutTemplate) return null;

  const hint =
    templateHintMeta ||
    (layoutTemplate
      ? {
          mapping: layoutTemplate,
          templateUsedAsHint: true,
          templateStatus: 'LEARNING'
        }
      : null);

  const parseResult = await parserService.parseStatement(buffer, {
    ...anchorData,
    forceLayoutFirstPrimary: true,
    layoutTemplate,
    templateHintMeta: hint,
    fileName,
    bankName,
    suppressWaterfallDetailLogs: true
  });

  if (!parseResult?.success) return parseResult;
  return parseResult;
}

/**
 * Full cold-start: learn layout, persist template, re-parse, record graduation outcome.
 * @param {object} params
 * @returns {Promise<{ mapping: object, parseResult: object, checksumOk: boolean, skipped: boolean }|null>}
 */
export async function coldStartLayoutForBatchFile(params = {}) {
  const {
    buffer,
    rtn,
    profileDoc,
    bankName,
    anchorData = {},
    fileName,
    parserService = pdfParserService,
    printedOpeningBalance,
    printedClosingBalance
  } = params;

  if (!buffer?.length) return null;

  const learnable = profileDoc ? getLatestLearnableTemplate(profileDoc) : null;
  if (hasVerifiedTemplate(profileDoc) && learnable?.mapping) {
    const parseResult = await reparseWithLayoutTemplate({
      buffer,
      layoutTemplate: learnable.mapping,
      anchorData,
      fileName,
      bankName,
      parserService,
      templateHintMeta: {
        mapping: learnable.mapping,
        templateVersion: learnable.version,
        templateStatus: learnable.status,
        templateUsedAsHint: true
      }
    });
    return parseResult
      ? {
          mapping: learnable.mapping,
          parseResult,
          checksumOk: Boolean(validateReconciliation(parseResult).ok),
          skipped: true
        }
      : null;
  }

  if (!profileDoc?._id) return null;

  let digitalTextExcerpt = null;
  try {
    const typeB = await extractTypeBTextFromBuffer(buffer);
    digitalTextExcerpt = typeB.slice(0, 8000);
  } catch {
    /* optional */
  }

  const learned = await learnAndPersistLayout({
    buffer,
    rtn,
    profileId: profileDoc._id,
    bankName,
    printedOpeningBalance,
    printedClosingBalance,
    digitalTextExcerpt
  });
  if (!learned?.mapping) return null;

  const parseResult = await reparseWithLayoutTemplate({
    buffer,
    layoutTemplate: learned.mapping,
    anchorData,
    fileName,
    bankName,
    parserService,
    templateHintMeta: {
      mapping: learned.mapping,
      templateVersion: learned.version,
      templateStatus: 'LEARNING',
      templateUsedAsHint: true
    }
  });

  if (!parseResult?.success) return null;

  const checksumRecon = validateReconciliation(parseResult);
  const cleanedRtn = String(rtn || '').replace(/\D/g, '');
  if (cleanedRtn.length === 9) {
    await processTemplateOutcome(cleanedRtn, learned.version, checksumRecon.ok, {
      lastError: checksumRecon.reason,
      fileName
    });
  }

  return {
    mapping: learned.mapping,
    parseResult,
    checksumOk: checksumRecon.ok,
    skipped: false
  };
}

export default {
  coldStartLayoutSyncEnabled,
  hasVerifiedTemplate,
  enrichMappingWithReconciliationSpec,
  learnAndPersistLayout,
  reparseWithLayoutTemplate,
  coldStartLayoutForBatchFile
};
