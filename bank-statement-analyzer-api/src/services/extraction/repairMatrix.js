/**
 * Bounded repair matrix: one targeted action per failure class.
 * Never re-run the same engine on unchanged input.
 * Each repair must be followed by isVerifiedCandidate (caller responsibility).
 */
export const REPAIR_ACTIONS = Object.freeze({
    SWITCH_STRATEGY: 'switch_extraction_strategy',
    DROP_SUMMARY_DUPES: 'drop_summary_header_dupes',
    SUPPLEMENTAL_LEDGER: 'supplemental_section_ledger',
    SUMMARY_ANCHOR_REREAD: 'summary_anchor_reread',
    CACHED_TEMPLATE_OR_AI: 'cached_template_then_one_ai',
    PARTITION_SUMMARY_ROWS: 'partition_summary_only_rows',
    DEDUPE_FINGERPRINTS: 'dedupe_row_fingerprints',
    QUARANTINE_OUT_OF_PERIOD: 'quarantine_malformed_dates',
    NONE: 'none'
});

const MATRIX = Object.freeze({
    ZERO_ROWS: {
        action: REPAIR_ACTIONS.SWITCH_STRATEGY,
        stopCondition: 'one_alternate_deterministic_extractor',
        maxAttempts: 1
    },
    DEPOSIT_INFLATION: {
        action: REPAIR_ACTIONS.DROP_SUMMARY_DUPES,
        stopCondition: 'reject_engine_if_still_inflated',
        maxAttempts: 1,
        neverMerge: true
    },
    WITHDRAWAL_INFLATION: {
        action: REPAIR_ACTIONS.DROP_SUMMARY_DUPES,
        stopCondition: 'reject_engine_if_delta_material',
        maxAttempts: 1,
        neverMerge: true
    },
    SUMMARY_ROW_CONTAMINATION: {
        action: REPAIR_ACTIONS.PARTITION_SUMMARY_ROWS,
        stopCondition: 'no_summary_as_transactions',
        maxAttempts: 1
    },
    DUPLICATE_ROWS: {
        action: REPAIR_ACTIONS.DEDUPE_FINGERPRINTS,
        stopCondition: 'unique_fingerprints',
        maxAttempts: 1
    },
    MALFORMED_DATES: {
        action: REPAIR_ACTIONS.QUARANTINE_OUT_OF_PERIOD,
        stopCondition: 'valid_statement_period_or_undercount',
        maxAttempts: 1
    },
    UNDERCOUNT: {
        action: REPAIR_ACTIONS.SUPPLEMENTAL_LEDGER,
        stopCondition: 'append_only_non_overlapping_section',
        maxAttempts: 1
    },
    AGGREGATE_MISMATCH: {
        action: REPAIR_ACTIONS.SUPPLEMENTAL_LEDGER,
        stopCondition: 'append_only_non_overlapping_section',
        maxAttempts: 1
    },
    BALANCE_MISMATCH: {
        action: REPAIR_ACTIONS.SUPPLEMENTAL_LEDGER,
        stopCondition: 'balance_equation_ok_or_terminal',
        maxAttempts: 1
    },
    FALSE_LAYOUT_PASS_RISK: {
        action: REPAIR_ACTIONS.DROP_SUMMARY_DUPES,
        stopCondition: 'reject_if_still_false_pass',
        maxAttempts: 1
    },
    MISSING_BALANCE: {
        action: REPAIR_ACTIONS.SUMMARY_ANCHOR_REREAD,
        stopCondition: 'evidence_incomplete',
        maxAttempts: 1
    },
    PRINTED_SUMMARY_MISPARSE: {
        action: REPAIR_ACTIONS.SUMMARY_ANCHOR_REREAD,
        stopCondition: 'evidence_incomplete',
        maxAttempts: 1
    },
    UNKNOWN_LAYOUT: {
        action: REPAIR_ACTIONS.CACHED_TEMPLATE_OR_AI,
        stopCondition: 'circuit_breaker_then_hitl',
        maxAttempts: 1,
        allowAi: true
    },
    TIER_A_CLOSING_FAIL: {
        action: REPAIR_ACTIONS.SUPPLEMENTAL_LEDGER,
        stopCondition: 'one_repair_then_terminal',
        maxAttempts: 1
    }
});

/**
 * @param {string} failureClass
 * @returns {{ action: string, stopCondition: string, maxAttempts: number, allowAi?: boolean, neverMerge?: boolean, failureClass?: string }}
 */
export function recommendRepair(failureClass) {
    const row = MATRIX[failureClass];
    if (!row) {
        return {
            action: REPAIR_ACTIONS.NONE,
            stopCondition: 'terminal_manual_review',
            maxAttempts: 0,
            failureClass
        };
    }
    return { ...row, failureClass };
}

/**
 * Track attempts so the same engine+input is never retried unchanged.
 */
export function createRepairTracker() {
    /** @type {Set<string>} */
    const seen = new Set();
    return {
    /**
     * @param {string} engine
     * @param {string} strategyKey
     * @param {string} failureClass
     * @returns {{ allowed: boolean, repair: object, reason?: string }}
     */
        tryBegin(engine, strategyKey, failureClass) {
            const repair = recommendRepair(failureClass);
            const key = `${engine}|${strategyKey}|${repair.action}`;
            if (seen.has(key)) {
                return {
                    allowed: false,
                    repair,
                    reason: 'same_engine_unchanged_input'
                };
            }
            if (repair.maxAttempts <= 0 || repair.action === REPAIR_ACTIONS.NONE) {
                return { allowed: false, repair, reason: 'no_repair_for_class' };
            }
            seen.add(key);
            return { allowed: true, repair };
        },
        snapshot() {
            return [...seen];
        }
    };
}

/**
 * @param {object} classified
 * @param {object} recon
 * @param {object} [verificationFlags] — isVerifiedCandidate.flags
 * @returns {string}
 */
export function normalizeFailureClass(classified, recon, verificationFlags = null) {
    if (verificationFlags) {
        if (verificationFlags.noSummaryRowsAsTransactions === false) {
            return 'SUMMARY_ROW_CONTAMINATION';
        }
        if (verificationFlags.noDuplicateFingerprints === false) {
            return 'DUPLICATE_ROWS';
        }
        if (verificationFlags.validStatementPeriod === false) {
            return 'MALFORMED_DATES';
        }
        if (
            verificationFlags.balanceEquationOk === false &&
      verificationFlags.printedTotalsOkWhenAvailable !== false
        ) {
            return 'BALANCE_MISMATCH';
        }
    }

    const c = classified?.class || 'MANUAL_REVIEW';
    if (c === 'OK') return 'OK';
    if (c === 'AGGREGATE_MISMATCH' || c === 'TIER_A_CLOSING_FAIL') {
        const wd = classified.withdrawalDelta;
        const dd = classified.depositDelta;
        if (
            (wd != null && wd < -0.01) ||
      (dd != null && dd < -0.01) ||
      (recon?.parsedWithdrawals != null &&
        recon?.printedWithdrawals != null &&
        Number(recon.parsedWithdrawals) < Number(recon.printedWithdrawals) - 0.01)
        ) {
            return 'UNDERCOUNT';
        }
        if (c === 'TIER_A_CLOSING_FAIL') return 'BALANCE_MISMATCH';
    }
    if (c === 'BLEED_OUTLIER_ROW') return 'WITHDRAWAL_INFLATION';
    return c;
}

export default {
    recommendRepair,
    createRepairTracker,
    normalizeFailureClass,
    REPAIR_ACTIONS,
    MATRIX
};
