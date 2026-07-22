/**
 * Per-statement parseManifest + reviewPacket for non-VERIFIED outcomes.
 */
import crypto from 'crypto';
import { classifyChecksumFailure } from '../../utils/checksumFailureMatrix.js';
import { recommendRepair } from './repairMatrix.js';

export const PARSER_VERSION = 'universal-ladder-1.0.0';

/**
 * @param {Buffer|string} input
 * @returns {string}
 */
export function documentHash(input) {
  const buf = Buffer.isBuffer(input) ? input : Buffer.from(String(input || ''));
  return crypto.createHash('sha256').update(buf).digest('hex').slice(0, 32);
}

/**
 * @param {object} candidate
 * @returns {object}
 */
function candidateResultRow(candidate) {
  const v = candidate?.verification;
  const recon = v?.recon;
  const classified = recon
    ? classifyChecksumFailure(recon, candidate.transactions || [])
    : { class: 'UNKNOWN' };
  const deltaCents =
    recon?.printedWithdrawals != null && recon?.parsedWithdrawals != null
      ? Math.round(
          (Number(recon.parsedWithdrawals) - Number(recon.printedWithdrawals)) * 100
        )
      : v?.closingCents != null && v?.openingCents != null
        ? v.closingCents - (v.openingCents + (v.creditCents || 0) - (v.debitCents || 0))
        : null;

  return {
    engine: candidate.engine,
    transactionCount: (candidate.transactions || []).length,
    checksumClass: classified.class,
    isVerified: Boolean(v?.isVerified),
    missingSections: candidate.missingSections || [],
    reconciliationDeltaCents: deltaCents,
    provenanceStrength: candidate.provenanceStrength ?? null
  };
}

/**
 * Build compact parse manifest.
 * @param {object} input
 * @returns {object}
 */
export function buildParseManifest(input = {}) {
  const candidates = input.candidates || [];
  const selected = input.selectedCandidate || null;
  const finalStatus =
    selected?.finalStatus ||
    input.finalStatus ||
    (selected?.verification?.isVerified ? 'VERIFIED' : input.terminalClass || 'MANUAL_REVIEW');

  return {
    documentHash: input.documentHash || null,
    documentClass: input.documentClass || null,
    candidateResults: candidates.map(candidateResultRow),
    selectedEngine: selected?.engine || input.selectedEngine || null,
    repairApplied: input.repairApplied || null,
    repairs: input.repairs || [],
    finalStatus,
    parserVersion: input.parserVersion || PARSER_VERSION,
    profileId: input.profileId || null,
    profileVersion: input.profileVersion || null
  };
}

const ACTION_BY_CLASS = {
  UNDERCOUNT: 'inspect_missing_section',
  WITHDRAWAL_INFLATION: 'reject_inflated_engine',
  DEPOSIT_INFLATION: 'reject_inflated_engine',
  ZERO_ROWS: 'switch_extraction_strategy',
  MISSING_BALANCE: 're_read_summary_pages',
  UNKNOWN_LAYOUT: 'layout_teach_or_manual',
  CORRUPT_PDF: 'request_reupload',
  ENCRYPTED: 'request_reupload',
  NEEDS_REUPLOAD: 'request_reupload',
  OCR_REQUIRED: 'run_marker_ocr',
  UNSUPPORTED_LAYOUT: 'manual_review',
  MANUAL_REVIEW: 'manual_review'
};

/**
 * Compact review packet for underwriters + fixture mining.
 * @param {object} input
 * @returns {object}
 */
export function buildReviewPacket(input = {}) {
  const failureClass =
    input.failureClass ||
    input.terminalClass ||
    input.finalStatus ||
    'MANUAL_REVIEW';
  const recon = input.recon || input.selectedCandidate?.verification?.recon || null;
  const expectedTotals = {
    creditsCents:
      recon?.printedDeposits != null
        ? Math.round(Number(recon.printedDeposits) * 100)
        : null,
    debitsCents:
      recon?.printedWithdrawals != null
        ? Math.round(Number(recon.printedWithdrawals) * 100)
        : null
  };
  const parsedTotals = {
    creditsCents:
      recon?.parsedDeposits != null
        ? Math.round(Number(recon.parsedDeposits) * 100)
        : null,
    debitsCents:
      recon?.parsedWithdrawals != null
        ? Math.round(Number(recon.parsedWithdrawals) * 100)
        : null
  };
  let deltaCents = null;
  if (expectedTotals.debitsCents != null && parsedTotals.debitsCents != null) {
    deltaCents = parsedTotals.debitsCents - expectedTotals.debitsCents;
  } else if (expectedTotals.creditsCents != null && parsedTotals.creditsCents != null) {
    deltaCents = parsedTotals.creditsCents - expectedTotals.creditsCents;
  }

  const candidateSummary = (input.candidates || []).map((c) => ({
    engine: c.engine,
    rows: (c.transactions || []).length,
    reconciliationOk: Boolean(c.verification?.isVerified)
  }));

  const repairHint = recommendRepair(failureClass);

  return {
    finalStatus: failureClass,
    failureClass,
    expectedTotals,
    parsedTotals,
    deltaCents,
    missingSections: input.missingSections || [],
    candidateSummary,
    recommendedNextAction:
      ACTION_BY_CLASS[failureClass] || repairHint?.action || 'manual_review',
    repair: repairHint
  };
}

/**
 * Attach manifest (+ review packet when not VERIFIED) onto a parse result.
 * @param {object} parseResult
 * @param {object} bundle
 */
export function attachParseEvidence(parseResult, bundle = {}) {
  if (!parseResult) return parseResult;
  const manifest = buildParseManifest(bundle);
  parseResult.metadata = parseResult.metadata || {};
  parseResult.metadata.parseManifest = manifest;
  if (manifest.finalStatus !== 'VERIFIED') {
    parseResult.metadata.reviewPacket = buildReviewPacket({
      ...bundle,
      finalStatus: manifest.finalStatus,
      failureClass: bundle.failureClass || manifest.finalStatus,
      candidates: bundle.candidates,
      recon: bundle.selectedCandidate?.verification?.recon
    });
  } else {
    parseResult.metadata.reviewPacket = null;
  }
  return parseResult;
}

export default {
  buildParseManifest,
  buildReviewPacket,
  attachParseEvidence,
  documentHash,
  PARSER_VERSION
};
