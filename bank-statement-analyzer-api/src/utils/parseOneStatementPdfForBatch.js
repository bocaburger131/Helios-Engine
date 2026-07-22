import crypto from 'crypto';
import { DocumentTriageError } from '../services/pdfParserService.js';
import logger from './logger.js';
import { applyParseQualityPipeline, attachChecksumDeltaProbe } from './statementParseQuality.js';
import { resolveExtractionMode, EXTRACTION_MODES } from '../services/extraction/extractionModeRouter.js';
import { parseWithRegistry } from '../services/extraction/parserRegistry.js';
import { batchConfirmationApplies, resolveBankIdFromName } from './bankConfirmationGate.js';
import { normalizeInstitutionName } from './identityMethodRank.js';
import { resolveLayoutTemplateForParse } from '../services/institutionalTemplatePersist.js';
import { buildDocumentMap } from '../services/extraction/layoutPipeline/layoutMapperService.js';
import { buildLayoutDiscoveryPayload } from '../services/extraction/layoutPipeline/layoutDiscoveryHelper.js';
import { isDemoMode } from '../config/appMode.js';

/**
 * Build parseResult-shaped object from sidecar adapter output.
 * @param {object} ocrResult
 * @param {object} modeInfo
 * @param {string} fileName
 */
function buildParseResultFromSidecar(ocrResult, modeInfo, fileName) {
  return {
    success: ocrResult.success,
    transactions: ocrResult.transactions || [],
    openingBalance: ocrResult.openingBalance,
    closingBalance: ocrResult.closingBalance,
    balances: {
      opening: ocrResult.openingBalance,
      closing: ocrResult.closingBalance
    },
    bankName: null,
    accountInfo: {},
    metadata: {
      ...(ocrResult.metadata || {}),
      extractionMode: modeInfo.extractionMode,
      extractionModeReason: modeInfo.reason,
      parserId: ocrResult.metadata?.parserId || 'pymupdf-tesseract-ocr',
      fileName
    }
  };
}

/**
 * Parse a single statement PDF for macro batch STAGE 2.
 * @returns {Promise<{ kind: string, fileIndex?: number, [key: string]: unknown }>}
 */
export async function parseOneStatementPdfForBatch({
  parserService,
  file,
  fileBuffer,
  fileIndex,
  finalAnchorData,
  correlationId,
  confirmedBankName,
  confirmedBankFileName,
  sessionConfirmedBank,
  userId,
  hashForLogging,
  mockComplianceLogger,
  identitySources = {}
}) {
  try {
    if (!fileBuffer) {
      throw new Error(`Could not read file data for ${file.originalname}`);
    }

    mockComplianceLogger.logFileAccess(userId, 'PROCESS_ATTEMPT', {
      filename: hashForLogging(file.originalname),
      size: file.size,
      fileIndex: fileIndex + 1
    });

    const modeInfo = await resolveExtractionMode({
      buffer: fileBuffer,
      fileName: file.originalname,
      mimetype: file.mimetype
    });

    let parseResult;
    const batchRtn = finalAnchorData?.rtn ?? identitySources?.rtn ?? null;
    const demoMode = isDemoMode();
    let templateHint = null;
    if (batchRtn && !demoMode) {
      try {
        templateHint = await resolveLayoutTemplateForParse(batchRtn);
      } catch (hintErr) {
        logger.warn(`[BATCH] layout template hint failed: ${hintErr.message}`);
      }
    }

    if (modeInfo.extractionMode === EXTRACTION_MODES.SCAN) {
      logger.info(`[BATCH] SCAN mode OCR for ${hashForLogging(file.originalname)}`);
      const ocrResult = await parseWithRegistry(
        fileBuffer,
        { extractionMode: EXTRACTION_MODES.SCAN },
        {
          // No extraction profile is resolved pre-OCR; sidecar runs the generic layout.
          fileName: file.originalname
        }
      );
      if (!ocrResult?.success || !(ocrResult.transactions || []).length) {
        throw new Error(
          `Scan-mode OCR failed for ${file.originalname}: ${ocrResult?.error || 'no transactions'}`
        );
      }
      parseResult = buildParseResultFromSidecar(ocrResult, modeInfo, file.originalname);
      const ocrText = ocrResult.metadata?.rawText || ocrResult.rawText || '';
      if (ocrText) {
        try {
          const documentMap = buildDocumentMap({
            text: ocrText,
            bankName: confirmedBankName || sessionConfirmedBank?.bankName,
            rtn: batchRtn,
            layoutTemplate: templateHint?.mapping ?? null
          });
          const layoutDiscovery = buildLayoutDiscoveryPayload(
            { documentMap, contextArchive: null },
            templateHint
          );
          parseResult.metadata = {
            ...(parseResult.metadata || {}),
            layoutPipelineDocumentMap: documentMap,
            layoutDiscovery
          };
        } catch (mapErr) {
          logger.warn(`[BATCH] SCAN layout map failed: ${mapErr.message}`);
        }
      }
    } else if (modeInfo.extractionMode === EXTRACTION_MODES.NATIVE) {
      throw new Error(
        `Native format ${modeInfo.nativeFormat || 'unknown'} (${file.originalname}) is not yet supported in macro batch`
      );
    } else {
      parseResult = await parserService.parseStatement(fileBuffer, {
        ...finalAnchorData,
        suppressWaterfallDetailLogs: true,
        correlationId,
        fileName: file.originalname,
        extractionMode: modeInfo.extractionMode,
        forceLayoutFirstPrimary: !demoMode,
        layoutTemplate: templateHint?.mapping ?? null,
        templateHintMeta: templateHint
      });
    }

    parseResult.metadata = {
      ...(parseResult.metadata || {}),
      extractionMode: modeInfo.extractionMode,
      nativeFormat: modeInfo.nativeFormat,
      extractionModeReason: modeInfo.reason
    };

    const effectiveConfirmedName =
      confirmedBankName || sessionConfirmedBank?.bankName || null;
    const effectiveConfirmedFileName =
      confirmedBankFileName ||
      (sessionConfirmedBank?.bankName ? file.originalname : null);

    const fileMatchesConfirmation =
      Boolean(effectiveConfirmedName) &&
      (batchConfirmationApplies(
        effectiveConfirmedName,
        effectiveConfirmedFileName,
        file.originalname,
        parseResult.bankName,
        normalizeInstitutionName
      ) ||
        Boolean(sessionConfirmedBank?.bankName));

    if (fileMatchesConfirmation) {
      const bankName = effectiveConfirmedName;
      const bankId =
        sessionConfirmedBank?.bankId || resolveBankIdFromName(bankName);
      parseResult.bankName = bankName;
      parseResult.bankNameConfidence = 'HIGH';
      parseResult.requiresBankConfirmation = false;
      parseResult.bankId = bankId;
      parseResult.metadata = {
        ...(parseResult.metadata || {}),
        identityMethod: 'USER_CONFIRMED',
        bankId,
        userConfirmedBank: true,
        confirmedAt: sessionConfirmedBank?.confirmedAt || new Date().toISOString()
      };
      logger.info(
        `[BATCH] Bank confirmed for ${hashForLogging(file.originalname)}: "${bankName}" (bankId=${bankId || 'n/a'})`
      );
    }

    if (parseResult.requiresBankConfirmation) {
      logger.info(
        `[BATCH] Identity Waterfall Level 4 — bank confirmation required for ${hashForLogging(file.originalname)} ("${parseResult.bankName || 'unknown'}")`
      );
      return {
        kind: 'bank_confirmation',
        fileIndex,
        fileName: file.originalname,
        parseResult
      };
    }

    const transactions = parseResult.transactions || [];
    if (transactions.length === 0) {
      throw new Error(`No transactions found in ${file.originalname}`);
    }

    const txDates = transactions.map((t) => new Date(t.date)).filter((d) => !isNaN(d.getTime()));
    const statementDate =
      txDates.length > 0 ? new Date(Math.min(...txDates.map((d) => d.getTime()))) : new Date();

    const fileHash = crypto.createHash('sha256').update(fileBuffer).digest('hex');

    const parsed = {
      fileName: file.originalname,
      fileSize: file.size,
      extractionMode: modeInfo.extractionMode,
      bankName: parseResult.bankName || parseResult.accountInfo?.bankName || 'Unknown',
      bankId: parseResult.bankId || parseResult.metadata?.bankId || null,
      accountNumber: parseResult.accountInfo?.accountNumber || 'UNKNOWN',
      openingBalance: parseResult.openingBalance ?? parseResult.balances?.opening ?? 0,
      closingBalance: parseResult.closingBalance ?? parseResult.balances?.closing ?? 0,
      transactions,
      statementDate,
      fileHash,
      parseResult,
      fileBuffer,
      layoutDiscovery:
        parseResult.metadata?.layoutDiscovery ??
        buildLayoutDiscoveryPayload(
          {
            documentMap: parseResult.metadata?.layoutPipelineDocumentMap,
            contextArchive: parseResult.metadata?.layoutPipelineContextArchive
          },
          parseResult.metadata?.templateHintMeta ?? templateHint
        )
    };

    const { checksumRecon, parseQuality } = applyParseQualityPipeline(parsed, {
      ...identitySources,
      ...finalAnchorData,
      extractedAnchorData: identitySources.extractedAnchorData || finalAnchorData
    });

    await attachChecksumDeltaProbe(parsed);

    logger.info(
      `[CHECKSUM] ${file.originalname}: ok=${checksumRecon.ok} txns=${parsed.transactions.length} ` +
        `opening=${checksumRecon.opening} closing=${checksumRecon.closing} ` +
        `deposits=${checksumRecon.deposits} withdrawals=${checksumRecon.withdrawals} delta=${checksumRecon.delta || '0'}`
    );

    return {
      kind: 'parsed',
      fileIndex,
      parsed: {
        ...parsed,
        parseQuality,
        checksumRecon,
        checksumDeltaProbe: parsed.checksumDeltaProbe ?? null
      }
    };
  } catch (err) {
    if (err instanceof DocumentTriageError || err?.name === 'DocumentTriageError') {
      const triageMatch = String(err?.message || '').match(/Triaged Document:\s*(.+)$/i);
      const documentType = triageMatch?.[1]?.trim() || 'OTHER';
      logger.info(`AI Triage: Skipping ${file.originalname} identified as ${documentType}`);
      return { kind: 'skip_triage', fileIndex, fileName: file.originalname, documentType };
    }

    logger.error(`Failed to parse ${file.originalname}: ${err.message}`);
    return {
      kind: 'error',
      fileIndex,
      fileName: file.originalname,
      error: err.message
    };
  }
}
