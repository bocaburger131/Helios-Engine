/**
 * Multi-candidate orchestration helpers: verify, select, repair once, evidence.
 */
import { createParseCandidate, selectBestVerifiedCandidate, isInflationFailure } from './parseCandidateContract.js';
import { verifyParseCandidate } from './isVerifiedCandidate.js';
import { classifyChecksumFailure } from '../../utils/checksumFailureMatrix.js';
import {
  recommendRepair,
  createRepairTracker,
  normalizeFailureClass,
  REPAIR_ACTIONS
} from './repairMatrix.js';
import { appendMissingSection } from './supplementalSectionLedger.js';
import {
  buildParseManifest,
  buildReviewPacket,
  attachParseEvidence,
  documentHash,
  PARSER_VERSION
} from './parseManifest.js';
import { SECTION_OWNERS } from './parseCandidateContract.js';

/**
 * Build verified/unverified candidates from engine txn lists.
 * @param {Array<{ engine: string, transactions: object[], meta?: object }>} engineResults
 * @param {object} sharedMeta
 * @param {string} [documentClass]
 * @returns {Array<object>}
 */
export function buildAndVerifyCandidates(engineResults, sharedMeta, documentClass) {
  return (engineResults || []).map((er) => {
    const candidate = createParseCandidate({
      engine: er.engine,
      transactions: er.transactions,
      meta: { ...sharedMeta, ...(er.meta || {}) },
      documentClass
    });
    return verifyParseCandidate(candidate);
  });
}

/**
 * Drop inflation candidates from the selectable set.
 * @param {Array<object>} candidates
 * @returns {{ selectable: object[], rejected: object[] }}
 */
export function partitionInflation(candidates) {
  const selectable = [];
  const rejected = [];
  for (const c of candidates || []) {
    const classified = c.verification?.recon
      ? classifyChecksumFailure(c.verification.recon, c.transactions)
      : { class: 'UNKNOWN' };
    const failureClass = normalizeFailureClass(classified, c.verification?.recon);
    if (isInflationFailure(failureClass)) {
      rejected.push({ ...c, failureClass });
    } else {
      selectable.push({ ...c, failureClass });
    }
  }
  return { selectable, rejected };
}

/**
 * Apply at most one bounded repair to the best non-verified candidate.
 * @param {object} candidate
 * @param {object} opts
 * @param {import('./repairMatrix.js').createRepairTracker extends Function} opts.tracker
 * @param {Record<string, object[]>} [opts.sectionRowBags] — sectionOwner → rows
 */
export function applyBoundedRepair(candidate, opts = {}) {
  const tracker = opts.tracker || createRepairTracker();
  const classified = candidate.verification?.recon
    ? classifyChecksumFailure(candidate.verification.recon, candidate.transactions)
    : { class: 'MANUAL_REVIEW' };
  const failureClass = normalizeFailureClass(classified, candidate.verification?.recon);
  const strategyKey = opts.strategyKey || `v1|${candidate.engine}|${failureClass}`;
  const begin = tracker.tryBegin(candidate.engine, strategyKey, failureClass);
  if (!begin.allowed) {
    return { repaired: false, reason: begin.reason, candidate, repair: begin.repair };
  }

  const repair = begin.repair;
  if (repair.action === REPAIR_ACTIONS.SUPPLEMENTAL_LEDGER) {
    const bags = opts.sectionRowBags || {};
    const present = new Set(
      Object.keys(candidate.sectionCoverage || {}).filter(
        (k) => (candidate.sectionCoverage[k] || 0) > 0
      )
    );
    for (const owner of [
      SECTION_OWNERS.FEES,
      SECTION_OWNERS.RETURNED_ITEMS,
      SECTION_OWNERS.CHECKS
    ]) {
      if (present.has(owner)) continue;
      const rows = bags[owner];
      if (!rows?.length) continue;
      const result = appendMissingSection({
        transactions: candidate.transactions,
        sectionRows: rows,
        sectionOwner: owner,
        meta: candidate.meta,
        engine: candidate.engine
      });
      if (result.applied) {
        const next = verifyParseCandidate(
          createParseCandidate({
            engine: candidate.engine,
            transactions: result.transactions,
            meta: candidate.meta,
            documentClass: candidate.documentClass
          })
        );
        return {
          repaired: true,
          repair,
          repairDetail: result,
          candidate: next,
          failureClass
        };
      }
    }
  }

  if (repair.action === REPAIR_ACTIONS.DROP_SUMMARY_DUPES) {
    const fps = new Set();
    const cleaned = (candidate.transactions || []).filter((t) => {
      const fp = t.rowFingerprint;
      if (!fp) return true;
      if (fps.has(fp)) return false;
      fps.add(fp);
      return t.sectionOwner !== SECTION_OWNERS.SUMMARY_ONLY;
    });
    const next = verifyParseCandidate(
      createParseCandidate({
        engine: candidate.engine,
        transactions: cleaned,
        meta: candidate.meta,
        documentClass: candidate.documentClass
      })
    );
    return { repaired: true, repair, candidate: next, failureClass };
  }

  return { repaired: false, reason: 'repair_not_applicable', candidate, repair, failureClass };
}

/**
 * Full select path: verify → reject inflation → optional one repair → select best VERIFIED.
 * @param {object} input
 */
export function resolveVerifiedCandidateBundle(input = {}) {
  const {
    engineResults = [],
    meta = {},
    documentClass = null,
    buffer = null,
    profileId = null,
    profileVersion = null,
    sectionRowBags = null
  } = input;

  let candidates = buildAndVerifyCandidates(engineResults, meta, documentClass);
  const { selectable, rejected } = partitionInflation(candidates);
  const tracker = createRepairTracker();
  const repairs = [];

  let working = selectable;
  let selected = selectBestVerifiedCandidate(working);

  if (!selected) {
    // One repair attempt on the first non-inflation candidate with a recon.
    const target = working.find((c) => c.verification && !c.verification.isVerified);
    if (target) {
      const repairResult = applyBoundedRepair(target, { tracker, sectionRowBags });
      if (repairResult.repaired) {
        repairs.push({
          engine: target.engine,
          action: repairResult.repair?.action,
          detail: repairResult.repairDetail?.deltaCents || null
        });
        working = working.map((c) =>
          c.engine === target.engine ? repairResult.candidate : c
        );
        candidates = candidates.map((c) =>
          c.engine === target.engine ? repairResult.candidate : c
        );
        selected = selectBestVerifiedCandidate(working);
      }
    }
  }

  const finalStatus = selected?.finalStatus || deriveTerminalClass(working, rejected);
  const hash = buffer ? documentHash(buffer) : null;
  const manifest = buildParseManifest({
    documentHash: hash,
    documentClass,
    candidates,
    selectedCandidate: selected,
    repairApplied: repairs[0]?.action || null,
    repairs,
    finalStatus,
    profileId,
    profileVersion,
    parserVersion: PARSER_VERSION
  });

  const reviewPacket =
    finalStatus === 'VERIFIED'
      ? null
      : buildReviewPacket({
          finalStatus,
          failureClass: finalStatus,
          candidates,
          selectedCandidate: selected || working[0],
          missingSections: inferMissingSections(working[0]),
          recon: (selected || working[0])?.verification?.recon
        });

  return {
    selected,
    candidates,
    rejectedInflation: rejected,
    finalStatus,
    manifest,
    reviewPacket,
    repairs
  };
}

function inferMissingSections(candidate) {
  if (!candidate) return [];
  const cov = candidate.sectionCoverage || {};
  const missing = [];
  for (const o of [SECTION_OWNERS.FEES, SECTION_OWNERS.RETURNED_ITEMS, SECTION_OWNERS.CHECKS]) {
    if (!cov[o]) missing.push(o);
  }
  return missing;
}

function deriveTerminalClass(working, rejected) {
  if (rejected?.length && !working?.length) return 'MANUAL_REVIEW';
  const c = working?.[0];
  if (!c) return 'MANUAL_REVIEW';
  if (!(c.transactions || []).length) return 'ZERO_ROWS';
  const classified = c.verification?.recon
    ? classifyChecksumFailure(c.verification.recon, c.transactions)
    : null;
  return normalizeFailureClass(classified || { class: 'MANUAL_REVIEW' }, c.verification?.recon);
}

export {
  selectBestVerifiedCandidate,
  attachParseEvidence,
  recommendRepair,
  createRepairTracker
};

export default { resolveVerifiedCandidateBundle, buildAndVerifyCandidates };
