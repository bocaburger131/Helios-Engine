/**
 * Universal supplemental section ledger.
 * Append only a section absent from the chosen candidate after fingerprint no-overlap proof.
 */
import {
    rowFingerprint,
    SECTION_OWNERS,
    normalizeCandidateRows
} from './parseCandidateContract.js';
import { reconcileStatement } from './statementReconciliation.js';
import { isVerifiedCandidate } from './isVerifiedCandidate.js';

/**
 * @param {Array<object>} existing
 * @returns {Set<string>}
 */
function fingerprintSet(existing) {
    return new Set((existing || []).map((r) => r.rowFingerprint || rowFingerprint(r)));
}

/**
 * Detect which section owners are already present on the candidate.
 * @param {Array<object>} transactions
 * @returns {Set<string>}
 */
export function presentSectionOwners(transactions) {
    const set = new Set();
    for (const t of transactions || []) {
        const o = t.sectionOwner || t.sectionId || t.section;
        if (o && o !== SECTION_OWNERS.SUMMARY_ONLY) set.add(String(o));
    }
    return set;
}

/**
 * Prove no fingerprint overlap; return appendable rows only.
 * @param {Array<object>} existing
 * @param {Array<object>} sectionRows
 * @param {string} sectionOwner
 * @returns {{ ok: boolean, rows: Array<object>, overlapCount: number, reason?: string }}
 */
export function proveNoOverlap(existing, sectionRows, sectionOwner) {
    const present = presentSectionOwners(existing);
    if (present.has(sectionOwner)) {
        return {
            ok: false,
            rows: [],
            overlapCount: 0,
            reason: 'section_already_owned'
        };
    }
    const seen = fingerprintSet(existing);
    const normalized = normalizeCandidateRows(sectionRows, {
        sourceEngine: sectionRows[0]?.sourceEngine || 'supplemental'
    }).map((r) => ({
        ...r,
        sectionOwner,
        sectionId: r.sectionId || sectionOwner
    }));
    const overlap = normalized.filter((r) => seen.has(r.rowFingerprint));
    if (overlap.length) {
        return {
            ok: false,
            rows: [],
            overlapCount: overlap.length,
            reason: 'fingerprint_overlap'
        };
    }
    return { ok: true, rows: normalized, overlapCount: 0 };
}

/**
 * Append one missing section; re-reconcile; report before/after delta.
 * @param {object} input
 * @returns {object}
 */
export function appendMissingSection(input = {}) {
    const {
        transactions = [],
        sectionRows = [],
        sectionOwner,
        meta = {}
    } = input;

    const beforeRecon = reconcileStatement(meta, transactions);
    const beforeVerification = isVerifiedCandidate({
        transactions,
        meta,
        engine: input.engine || 'text'
    });

    const proof = proveNoOverlap(transactions, sectionRows, sectionOwner);
    if (!proof.ok) {
        return {
            applied: false,
            reason: proof.reason,
            overlapCount: proof.overlapCount,
            transactions,
            before: {
                checksumOk: beforeRecon.checksumOk,
                parsedWithdrawals: beforeRecon.parsedWithdrawals,
                parsedDeposits: beforeRecon.parsedDeposits
            },
            after: null,
            deltaCents: null
        };
    }

    if (!proof.rows.length) {
        return {
            applied: false,
            reason: 'empty_section',
            transactions,
            before: {
                checksumOk: beforeRecon.checksumOk,
                parsedWithdrawals: beforeRecon.parsedWithdrawals,
                parsedDeposits: beforeRecon.parsedDeposits
            },
            after: null,
            deltaCents: null
        };
    }

    const merged = [...transactions, ...proof.rows];
    const afterRecon = reconcileStatement(meta, merged);
    const afterVerification = isVerifiedCandidate({
        transactions: merged,
        meta,
        engine: input.engine || 'text'
    });

    const beforeDebits = Math.round(Number(beforeRecon.parsedWithdrawals || 0) * 100);
    const afterDebits = Math.round(Number(afterRecon.parsedWithdrawals || 0) * 100);
    const beforeCredits = Math.round(Number(beforeRecon.parsedDeposits || 0) * 100);
    const afterCredits = Math.round(Number(afterRecon.parsedDeposits || 0) * 100);

    return {
        applied: true,
        sectionOwner,
        addedCount: proof.rows.length,
        transactions: merged,
        before: {
            checksumOk: beforeRecon.checksumOk,
            isVerified: beforeVerification.isVerified,
            parsedWithdrawals: beforeRecon.parsedWithdrawals,
            parsedDeposits: beforeRecon.parsedDeposits
        },
        after: {
            checksumOk: afterRecon.checksumOk,
            isVerified: afterVerification.isVerified,
            parsedWithdrawals: afterRecon.parsedWithdrawals,
            parsedDeposits: afterRecon.parsedDeposits
        },
        deltaCents: {
            debits: afterDebits - beforeDebits,
            credits: afterCredits - beforeCredits
        },
        recon: afterRecon,
        verification: afterVerification
    };
}

/**
 * Spec-driven keys → section owners.
 * @param {object} reconciliationSpec
 * @returns {Array<{ key: string, sectionOwner: string }>}
 */
export function sectionOwnersFromSpec(reconciliationSpec) {
    const lines = reconciliationSpec?.summaryLines || [];
    return lines
        .filter((l) => l.role === 'debit' || l.role === 'credit')
        .map((l) => {
            const k = String(l.key || '').toLowerCase();
            let sectionOwner = SECTION_OWNERS.PRIMARY_ACTIVITY;
            if (/return/.test(k)) sectionOwner = SECTION_OWNERS.RETURNED_ITEMS;
            else if (/fee/.test(k)) sectionOwner = SECTION_OWNERS.FEES;
            else if (/check/.test(k)) sectionOwner = SECTION_OWNERS.CHECKS;
            else if (/adjust/.test(k)) sectionOwner = SECTION_OWNERS.ADJUSTMENTS;
            return { key: l.key, sectionOwner };
        });
}

export default {
    appendMissingSection,
    proveNoOverlap,
    presentSectionOwners,
    sectionOwnersFromSpec
};
