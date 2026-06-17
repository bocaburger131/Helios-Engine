/**
 * Layout discovery phase — run before profile extract on every parse.
 */
import logger from '../../../utils/logger.js';
import { runLayoutFirstPipeline } from './layoutFirstOrchestrator.js';
import { buildDocumentMap } from './layoutMapperService.js';
import { comparePipelineShadow } from './pipelineShadowComparator.js';
import {
  layoutFirstPrimaryEnabled,
  layoutFirstShadowEnabled,
  layoutFirstVeraFallbackEnabled
} from './pipelineConfig.js';
import { resolveLayoutTemplateForParse } from '../../institutionalTemplatePersist.js';

/**
 * @param {object} params
 * @returns {Promise<object>}
 */
export async function runLayoutDiscoveryForParse(params = {}) {
  const {
    buffer,
    data,
    stitcher,
    profile,
    options = {},
    waterfallResult,
    accountInfo,
    indicators,
    parserService,
    resolvedBankType,
    defaultYear,
    plumberTransactions
  } = params;

  const runLayoutPipeline =
    options.forceLayoutFirstShadow ||
    options.forceLayoutFirstPrimary ||
    layoutFirstShadowEnabled() ||
    layoutFirstPrimaryEnabled();

  if (!runLayoutPipeline) {
    return {
      run: false,
      layoutPipelineResult: null,
      layoutPipelineShadow: null,
      layoutPrimaryUsed: false,
      layoutTemplate: options.layoutTemplate ?? null,
      templateHintMeta: options.templateHintMeta ?? null
    };
  }

  let layoutTemplate = options.layoutTemplate ?? null;
  let templateHintMeta = options.templateHintMeta ?? null;

  if (!layoutTemplate && waterfallResult?.rtn) {
    try {
      const hint = await resolveLayoutTemplateForParse(waterfallResult.rtn);
      if (hint?.mapping) {
        layoutTemplate = hint.mapping;
        templateHintMeta = hint;
      }
    } catch (hintErr) {
      logger.warn('[LAYOUT_DISCOVERY] template hint load failed', { error: hintErr.message });
    }
  }

  const usePrimary = options.forceLayoutFirstPrimary ?? layoutFirstPrimaryEnabled();
  const stitcherPrinted = params.stitcherPrinted;

  let layoutPipelineResult = null;
  try {
    layoutPipelineResult = await runLayoutFirstPipeline(buffer, {
      text: data.text,
      altText: stitcher.typeB?.combinedText,
      rtn: waterfallResult.rtn ?? null,
      bankName: params.bankNameFromTriage || accountInfo.bankName,
      profileId: profile.id,
      fileName: options?.fileName,
      defaultYear,
      pageCount: data.numpages,
      stitcher,
      layoutTemplate,
      parserService,
      resolvedBankType,
      plumberTransactions,
      stitcherPrinted,
      typeAText: stitcher.typeA?.text ?? null,
      accountNumber: accountInfo.accountNumber || indicators.accountNumber || null,
      applicationContext: parserService._resolveAnchorOptions(options),
      anchorData: parserService._resolveAnchorOptions(options),
      enableVeraFallback:
        options.enableVeraFallback ?? (usePrimary && layoutFirstVeraFallbackEnabled()),
      correlationId: options.correlationId ?? null
    });
  } catch (layoutErr) {
    logger.warn('[LAYOUT_DISCOVERY] pipeline failed — building fallback document map', {
      error: layoutErr.message,
      profileId: profile.id
    });
    try {
      const documentMap = buildDocumentMap({
        text: data.text,
        altText: stitcher.typeB?.combinedText,
        rtn: waterfallResult.rtn ?? null,
        bankName: params.bankNameFromTriage || accountInfo.bankName,
        profileId: profile.id,
        pageCount: data.numpages,
        layoutTemplate,
        stitcher
      });
      layoutPipelineResult = {
        profileId: profile.id,
        transactions: [],
        documentMap,
        contextArchive: null,
        reconciliation: { checksumOk: false },
        meta: {}
      };
    } catch (mapErr) {
      logger.warn('[LAYOUT_DISCOVERY] fallback document map failed', { error: mapErr.message });
    }
  }

  let layoutPrimaryUsed = false;
  let layoutRecon = null;

  if (layoutPipelineResult?.transactions?.length > 0 && usePrimary) {
    layoutRecon =
      layoutPipelineResult.reconciliation?.reconciliationBreakdown ??
      layoutPipelineResult.reconciliation;
    if (layoutRecon?.checksumOk) {
      layoutPrimaryUsed = true;
    }
  }

  return {
    run: true,
    layoutPipelineResult,
    layoutPipelineShadow: null,
    layoutPrimaryUsed,
    layoutRecon,
    layoutTemplate,
    templateHintMeta,
    usePrimary
  };
}

/**
 * Compare legacy profile output against layout-first when both ran.
 * @param {object} legacy
 * @param {object} layoutDiscovery
 * @returns {object|null}
 */
export function compareLayoutDiscoveryShadow(legacy, layoutDiscovery) {
  if (!layoutDiscovery?.layoutPipelineResult) return null;
  return comparePipelineShadow(legacy, layoutDiscovery.layoutPipelineResult);
}

/**
 * Build layoutDiscovery payload for parse metadata / Statement persistence.
 * @param {object} layoutPipelineResult
 * @param {object} [templateHintMeta]
 * @returns {object|null}
 */
export function buildLayoutDiscoveryPayload(layoutPipelineResult, templateHintMeta = null) {
  if (!layoutPipelineResult?.documentMap) return null;
  const dm = layoutPipelineResult.documentMap;
  return {
    documentMap: dm,
    contextArchive: layoutPipelineResult.contextArchive ?? null,
    fingerprint: dm.fingerprint ?? null,
    mappingSource: dm.mappingSource ?? 'heuristic',
    templateVersion: templateHintMeta?.templateVersion ?? null,
    templateStatus: templateHintMeta?.templateStatus ?? null,
    parsedAt: new Date().toISOString()
  };
}

export default {
  runLayoutDiscoveryForParse,
  compareLayoutDiscoveryShadow,
  buildLayoutDiscoveryPayload
};
