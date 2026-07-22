/**
 * Sole authority for finalStatus: "VERIFIED".
 * Every engine/path returns a ParseCandidate and must call this — no bypass.
 */
import { reconcileStatement } from './statementReconciliation.js';
import {
    toCents,
    rowFingerprint,
    SECTION_OWNERS,
    createParseCandidate
} from './parseCandidateContract.js';

const POSTING_GRACE_DAYS = Number(process.env.STATEMENT_POSTING_GRACE_DAYS) || 5;

/**
 * @param {string|Date} d
 * @returns {Date|null}
 */
function parseDate(d) {
    if (!d) return null;
    const dt = d instanceof Date ? d : new Date(String(d));
    return Number.isNaN(dt.getTime()) ? null : dt;
}

/**
 * @param {object} meta
 * @returns {{ start: Date|null, end: Date|null }}
 */
function statementPeriodBounds(meta) {
    const start = parseDate(meta?.periodStart || meta?.statementPeriod?.start);
    const end = parseDate(meta?.periodEnd || meta?.statementPeriod?.end);
    return { start, end };
}

/**
 * @param {Date} d
 * @param {Date} start
 * @param {Date} end
 * @param {number} graceDays
 */
function inPeriod(d, start, end, graceDays) {
    if (!start || !end || !d) return true;
    const ms = graceDays * 86400000;
    return d.getTime() >= start.getTime() - ms && d.getTime() <= end.getTime() + ms;
}

/**
 * Evaluate a ParseCandidate (or raw { transactions, meta }).
 * @param {object} candidate
 * @returns {{
 *   isVerified: boolean,
 *   finalStatus: 'VERIFIED'|null,
 *   flags: object,
 *   recon: object|null,
 *   reasons: string[]
 * }}
 */
export function isVerifiedCandidate(candidate) {
    const c =
    candidate?.transactions != null && !candidate?.meta
        ? createParseCandidate(candidate)
        : candidate?.transactions != null
            ? candidate
            : createParseCandidate({
                transactions: candidate?.transactions || [],
                meta: candidate?.meta || candidate,
                engine: candidate?.engine
            });

    const meta = c.meta || {};
    const txs = Array.isArray(c.transactions) ? c.transactions : [];
    const reasons = [];

    const openingCents = toCents(meta.openingBalance);
    const closingCents = toCents(meta.closingBalance);
    let creditCents = 0;
    let debitCents = 0;
    for (const t of txs) {
        const cents = t.amountCents ?? toCents(t.amount);
        if (cents >= 0) creditCents += cents;
        else debitCents += Math.abs(cents);
    }
    const computedClosingCents = openingCents + creditCents - debitCents;
    // Allow 1-cent rounding slack; never use float amounts for the equation itself.
    const balanceEquationOk =
    txs.length > 0 && Math.abs(closingCents - computedClosingCents) <= 1;

    if (!balanceEquationOk) {
        reasons.push(
            txs.length === 0
                ? 'ZERO_ROWS'
                : `balance_equation_fail expected=${closingCents} got=${computedClosingCents}`
        );
    }

    const recon = reconcileStatement(meta, txs);

    const hasPrintedActivity =
    (meta.printedDeposits != null && Number.isFinite(Number(meta.printedDeposits))) ||
    (meta.printedWithdrawals != null && Number.isFinite(Number(meta.printedWithdrawals)));

    const printedTotalsOkWhenAvailable = !hasPrintedActivity
        ? true
        : Boolean(recon.depositsMatch && recon.withdrawalsMatch);

    if (!printedTotalsOkWhenAvailable) {
        reasons.push('printed_totals_mismatch');
    }

    const fps = txs.map((t) => t.rowFingerprint || rowFingerprint(t));
    const noDuplicateFingerprints = new Set(fps).size === fps.length;
    if (!noDuplicateFingerprints) reasons.push('duplicate_fingerprints');

    const { start, end } = statementPeriodBounds(meta);
    let validStatementPeriod = true;
    if (start && end) {
        for (const t of txs) {
            const d = parseDate(t.date || t.postedDate);
            if (d && !inPeriod(d, start, end, POSTING_GRACE_DAYS)) {
                validStatementPeriod = false;
                break;
            }
        }
    }
    if (!validStatementPeriod) reasons.push('date_outside_period');

    const validAccountIdentity =
    meta.accountNumber == null ||
    meta.closingAccountNumber == null ||
    String(meta.accountNumber) === String(meta.closingAccountNumber);
    if (!validAccountIdentity) reasons.push('account_identity_mismatch');

    const summaryAsTxn = txs.some(
        (t) =>
            t.sectionOwner === SECTION_OWNERS.SUMMARY_ONLY ||
      t.summaryOnly === true
    );
    const noSummaryRowsAsTransactions = !summaryAsTxn;
    if (!noSummaryRowsAsTransactions) reasons.push('summary_rows_as_transactions');

    const hasSpec =
    Boolean(meta.reconciliationSpec) &&
    meta.printedLines != null &&
    Object.keys(meta.printedLines).length > 0;

    let requiredSectionsCovered = true;
    let printedSectionTotalsOk = true;
    if (hasSpec) {
        printedSectionTotalsOk = recon.sectionReconciled !== false;
        if (recon.sectionReconciled === false) {
            requiredSectionsCovered = false;
            reasons.push('section_totals_mismatch');
        }
    }

    // Universal ledger gate still required (printed closing identity when spec lines exist).
    if (!recon.checksumOk) {
        reasons.push('reconcileStatement_checksumOk_false');
    }

    const isVerified =
    balanceEquationOk &&
    printedTotalsOkWhenAvailable &&
    noDuplicateFingerprints &&
    validStatementPeriod &&
    validAccountIdentity &&
    noSummaryRowsAsTransactions &&
    requiredSectionsCovered &&
    Boolean(recon.checksumOk);

    return {
        isVerified,
        finalStatus: isVerified ? 'VERIFIED' : null,
        flags: {
            balanceEquationOk,
            printedTotalsOkWhenAvailable,
            noDuplicateFingerprints,
            validStatementPeriod,
            validAccountIdentity,
            noSummaryRowsAsTransactions,
            requiredSectionsCovered,
            printedSectionTotalsOk,
            reconcileChecksumOk: Boolean(recon.checksumOk)
        },
        recon,
        reasons,
        openingCents,
        closingCents,
        creditCents,
        debitCents
    };
}

/**
 * Attach verification onto a candidate; only this path may set VERIFIED.
 * @param {object} candidate
 * @returns {object}
 */
export function verifyParseCandidate(candidate) {
    const verification = isVerifiedCandidate(candidate);
    return {
        ...candidate,
        verification,
        finalStatus: verification.finalStatus
    };
}

export default { isVerifiedCandidate, verifyParseCandidate };
