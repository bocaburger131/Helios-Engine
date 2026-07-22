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
 * Apply at most one bounded repair to a non-verified candidate; always re-verify.
 * @param {object} candidate
 * @param {object} opts
 */
export function applyBoundedRepair(candidate, opts = {}) {
  const tracker = opts.tracker || createRepairTracker();
  const classified = candidate.verification?.recon
    ? classifyChecksumFailure(candidate.verification.recon, candidate.transactions)
    : { class: 'MANUAL_REVIEW' };
  const failureClass = normalizeFailureClass(
    classified,
    candidate.verification?.recon,
    candidate.verification?.flags
  );
  const strategyKey = opts.strategyKey || `v1|${candidate.engine}|${failureClass}`;
  const begin = tracker.tryBegin(candidate.engine, strategyKey, failureClass);
  if (!begin.allowed) {
    return { repaired: false, reason: begin.reason, candidate, repair: begin.repair, failureClass };
  }

  const repair = begin.repair;
  const before = {
    isVerified: Boolean(candidate.verification?.isVerified),
    txnCount: (candidate.transactions || []).length,
    checksumOk: Boolean(candidate.verification?.recon?.checksumOk)
  };

  /** @type {object[]} */
  let nextTxns = candidate.transactions || [];
  let repairDetail = null;

  if (repair.action === REPAIR_ACTIONS.SUPPLEMENTAL_LEDGER) {
    const bags = opts.sectionRowBags || {};
    const present = new Set(
      Object.keys(candidate.sectionCoverage || {}).filter(
        (k) => (candidate.sectionCoverage[k] || 0) > 0
      )
    );
    let applied = false;
    for (const owner of [
      SECTION_OWNERS.FEES,
      SECTION_OWNERS.RETURNED_ITEMS,
      SECTION_OWNERS.CHECKS
    ]) {
      if (present.has(owner)) continue;
      const rows = bags[owner];
      if (!rows?.length) continue;
      const result = appendMissingSection({
        transactions: nextTxns,
        sectionRows: rows,
        sectionOwner: owner,
        meta: candidate.meta,
        engine: candidate.engine
      });
      if (result.applied) {
        nextTxns = result.transactions;
        repairDetail = result;
        applied = true;
        break;
      }
    }
    if (!applied) {
      return { repaired: false, reason: 'no_missing_section_rows', candidate, repair, failureClass };
    }
  } else if (
    repair.action === REPAIR_ACTIONS.DROP_SUMMARY_DUPES ||
    repair.action === REPAIR_ACTIONS.DEDUPE_FINGERPRINTS ||
    repair.action === REPAIR_ACTIONS.PARTITION_SUMMARY_ROWS
  ) {
    const fps = new Set();
    nextTxns = (candidate.transactions || []).filter((t) => {
      if (t.sectionOwner === SECTION_OWNERS.SUMMARY_ONLY || t.summaryOnly) return false;
      const fp = t.rowFingerprint;
      if (!fp) return true;
      if (fps.has(fp)) return false;
      fps.add(fp);
      return true;
    });
  } else if (repair.action === REPAIR_ACTIONS.QUARANTINE_OUT_OF_PERIOD) {
    const start = candidate.meta?.periodStart || candidate.meta?.statementPeriod?.start;
    const end = candidate.meta?.periodEnd || candidate.meta?.statementPeriod?.end;
    if (!start || !end) {
      return { repaired: false, reason: 'no_period_bounds', candidate, repair, failureClass };
    }
    const startMs = new Date(start).getTime();
    const endMs = new Date(end).getTime();
    const grace = (Number(process.env.STATEMENT_POSTING_GRACE_DAYS) || 5) * 86400000;
    nextTxns = (candidate.transactions || []).filter((t) => {
      const d = new Date(t.date || t.postedDate);
      if (Number.isNaN(d.getTime())) return false;
      return d.getTime() >= startMs - grace && d.getTime() <= endMs + grace;
    });
  } else if (repair.action === REPAIR_ACTIONS.SWITCH_STRATEGY) {
    const alt = opts.alternateCandidate;
    if (!alt?.transactions?.length) {
      return { repaired: false, reason: 'no_alternate_engine', candidate, repair, failureClass };
    }
    const next = verifyParseCandidate(
      createParseCandidate({
        engine: alt.engine,
        transactions: alt.transactions,
        meta: { ...candidate.meta, ...(alt.meta || {}) },
        documentClass: candidate.documentClass
      })
    );
    return {
      repaired: true,
      repair,
      failureClass,
      candidate: next,
      repairDetail: {
        before,
        after: {
          isVerified: next.verification?.isVerified,
          txnCount: next.transactions?.length,
          checksumOk: next.verification?.recon?.checksumOk
        },
        switchedTo: alt.engine
      }
    };
  } else if (repair.action === REPAIR_ACTIONS.SUMMARY_ANCHOR_REREAD) {
    // Evidence-only: mark incomplete unless caller provided summaryMeta patch.
    if (opts.summaryMetaPatch) {
      const next = verifyParseCandidate(
        createParseCandidate({
          engine: candidate.engine,
          transactions: candidate.transactions,
          meta: { ...candidate.meta, ...opts.summaryMetaPatch },
          documentClass: candidate.documentClass
        })
      );
      return {
        repaired: true,
        repair,
        failureClass,
        candidate: next,
        repairDetail: { before, after: { isVerified: next.verification?.isVerified } }
      };
    }
    return {
      repaired: false,
      reason: 'evidence_incomplete',
      candidate,
      repair,
      failureClass
    };
  } else if (repair.action === REPAIR_ACTIONS.CACHED_TEMPLATE_OR_AI) {
    return {
      repaired: false,
      reason: 'unknown_layout_requires_hitl_or_teach',
      candidate,
      repair,
      failureClass
    };
  } else {
    return { repaired: false, reason: 'repair_not_applicable', candidate, repair, failureClass };
  }

  const next = verifyParseCandidate(
    createParseCandidate({
      engine: candidate.engine,
      transactions: nextTxns,
      meta: candidate.meta,
      documentClass: candidate.documentClass
    })
  );

  return {
    repaired: true,
    repair,
    failureClass,
    candidate: next,
    repairDetail: repairDetail || {
      before,
      after: {
        isVerified: Boolean(next.verification?.isVerified),
        txnCount: (next.transactions || []).length,
        checksumOk: Boolean(next.verification?.recon?.checksumOk)
      }
    }
  };
}

/**
 * Full select path: verify → reject inflation → optional one repair → select best VERIFIED.
 * Phase 3 owns repairs; Phase 1 callers should use resolveBasicCandidateBundle.
 * @param {object} input
 */
export function resolveVerifiedCandidateBundle(input = {}) {
  const basic = resolveBasicCandidateBundle(input);
  if (basic.selected || input.skipRepair) {
    return basic;
  }

  const {
    sectionRowBags = null
  } = input;

  let candidates = basic.candidates;
  const { selectable, rejected } = partitionInflation(candidates);
  const tracker = createRepairTracker();
  const repairs = [];

  let working = selectable;
  let selected = selectBestVerifiedCandidate(working, {
    documentClass: input.documentClass,
    engineOrder: input.engineOrder
  });

  if (!selected) {
    const target = working.find((c) => c.verification && !c.verification.isVerified);
    if (target) {
      const alternate = working.find((c) => c.engine !== target.engine) ||
        candidates.find((c) => c.engine !== target.engine);
      const repairResult = applyBoundedRepair(target, {
        tracker,
        sectionRowBags,
        alternateCandidate: alternate
          ? { engine: alternate.engine, transactions: alternate.transactions, meta: alternate.meta }
          : null
      });
      if (repairResult.repaired) {
        repairs.push({
          engine: target.engine,
          action: repairResult.repair?.action,
          failureClass: repairResult.failureClass,
          detail: repairResult.repairDetail?.deltaCents || repairResult.repairDetail?.after || null,
          before: repairResult.repairDetail?.before || null,
          after: repairResult.repairDetail?.after || null
        });
        working = working.map((c) =>
          c.engine === target.engine ? repairResult.candidate : c
        );
        candidates = candidates.map((c) =>
          c.engine === target.engine ? repairResult.candidate : c
        );
        selected = selectBestVerifiedCandidate(working, {
          documentClass: input.documentClass,
          engineOrder: input.engineOrder
        });
      }
    }
  }

  const finalStatus = selected?.finalStatus || deriveTerminalClass(working, rejected);
  const hash = input.buffer ? documentHash(input.buffer) : basic.manifest?.documentHash;
  const manifest = buildParseManifest({
    documentHash: hash,
    documentClass: input.documentClass ?? null,
    candidates,
    selectedCandidate: selected,
    repairApplied: repairs[0]?.action || null,
    repairs,
    finalStatus,
    profileId: input.profileId || null,
    profileVersion: input.profileVersion || null,
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

/**
 * Phase 1 core ladder: verify → reject inflation → select best VERIFIED → manifest.
 * Does NOT run bounded repairs (Phase 3).
 * @param {object} input
 */
export function resolveBasicCandidateBundle(input = {}) {
  const {
    engineResults = [],
    meta = {},
    documentClass = null,
    buffer = null,
    profileId = null,
    profileVersion = null
  } = input;

  const candidates = buildAndVerifyCandidates(engineResults, meta, documentClass);
  const { selectable, rejected } = partitionInflation(candidates);
  const selected = selectBestVerifiedCandidate(selectable, {
    documentClass,
    engineOrder: input.engineOrder || null
  });
  const finalStatus = selected?.finalStatus || deriveTerminalClass(selectable, rejected);
  const hash = buffer ? documentHash(buffer) : null;
  const manifest = buildParseManifest({
    documentHash: hash,
    documentClass,
    candidates,
    selectedCandidate: selected,
    repairApplied: null,
    repairs: [],
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
          selectedCandidate: selected || selectable[0],
          missingSections: inferMissingSections(selectable[0]),
          recon: (selected || selectable[0])?.verification?.recon
        });

  return {
    selected,
    candidates,
    rejectedInflation: rejected,
    finalStatus,
    manifest,
    reviewPacket,
    repairs: []
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

export default {
  resolveVerifiedCandidateBundle,
  resolveBasicCandidateBundle,
  buildAndVerifyCandidates
};
