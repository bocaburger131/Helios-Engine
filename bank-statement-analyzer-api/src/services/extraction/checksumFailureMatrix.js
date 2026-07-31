/**
 * Bounded checksum failure repair matrix.
 * Each detected failure pattern maps to exactly ONE repair attempt.
 * Repairs are verified by re-running reconciliation before being accepted.
 */

import logger from '../../utils/logger.js';

// ── Detection ──────────────────────────────────────────────────────────────

const FLIP_DEPOSIT_RATIO_MIN = 1.2;  // parsedDeposits > 1.2× printedDeposits
const FLIP_WITHDRAWAL_RATIO_MIN = 0.8; // parsedWithdrawals < 0.8× printedWithdrawals

/**
 * Detect COLUMN_FLIP pattern: deposits inflated, withdrawals deflated.
 * This is the classic CREDIT-default symptom where debits are misclassified
 * as credits, inflating deposit totals and deflating withdrawal totals.
 *
 * @param {object} reconciliation — from reconcileStatement()
 * @returns {boolean}
 */
export function detectColumnFlip(reconciliation) {
  if (!reconciliation) return false;
  const {
    parsedDeposits,
    printedDeposits,
    parsedWithdrawals,
    printedWithdrawals,
  } = reconciliation;

  // Need both printed totals to compare
  if (
    printedDeposits == null ||
    printedWithdrawals == null ||
    !Number.isFinite(printedDeposits) ||
    !Number.isFinite(printedWithdrawals)
  ) {
    return false;
  }

  const depositRatio =
    printedDeposits > 0 ? parsedDeposits / printedDeposits : 999;
  const withdrawalRatio =
    printedWithdrawals > 0 ? parsedWithdrawals / printedWithdrawals : 0;

  return (
    depositRatio >= FLIP_DEPOSIT_RATIO_MIN &&
    withdrawalRatio <= FLIP_WITHDRAWAL_RATIO_MIN
  );
}

// ── Repair ─────────────────────────────────────────────────────────────────

/**
 * COLUMN_FLIP repair: invert the sign of every transaction and re-run reconciliation.
 *
 * The repair is ONLY applied when:
 * 1. Column flip is detected via deposit/withdrawal ratios
 * 2. Section/header semantics independently confirm the flip
 *    (all transactions are from the same section OR no section contradicts the flip)
 * 3. Re-running reconciliation after the flip produces a passing checksum
 *
 * If any condition fails, the original transactions are returned unchanged.
 *
 * @param {object} params
 * @param {Array<object>} params.transactions — normalized transactions with amount, type, sectionId
 * @param {object} params.reconciliation — from reconcileStatement()
 * @param {Function} params.reconcileFn — (txs, meta) => newReconciliation
 * @param {object} [params.meta] — metadata passed to reconcileFn
 * @returns {{ transactions: Array<object>, reconciliation: object, repaired: boolean, repairType: string|null }}
 */
export function attemptColumnFlipRepair({
  transactions,
  reconciliation,
  reconcileFn,
  meta = {},
}) {
  if (!detectColumnFlip(reconciliation)) {
    return { transactions, reconciliation, repaired: false, repairType: null };
  }

  logger.info('[CHECKSUM_MATRIX] COLUMN_FLIP_SUSPECTED — verifying section semantics', {
    depositRatio: (
      reconciliation.printedDeposits > 0
        ? (reconciliation.parsedDeposits / reconciliation.printedDeposits).toFixed(2)
        : '∞'
    ),
    withdrawalRatio: (
      reconciliation.printedWithdrawals > 0
        ? (reconciliation.parsedWithdrawals / reconciliation.printedWithdrawals).toFixed(2)
        : '0'
    ),
    txnCount: transactions.length,
  });

  // Verify section semantics: if any transaction is in a known debit section
  // and is marked CREDIT, the flip is independently confirmed.
  const DEBIT_SECTIONS = new Set([
    'withdrawals', 'checks', 'fees', 'returned_items', 'adjustments',
    'electronic_withdrawals', 'atm_debit', 'other_withdrawals',
  ]);
  const CREDIT_SECTIONS = new Set(['deposits']);

  let debitSectionCredits = 0;
  let creditSectionDebits = 0;
  let totalWithSection = 0;

  for (const t of transactions) {
    const sid = t.sectionId || t.section || '';
    if (!sid || sid === 'unknown' || sid === 'primary_activity') continue;
    totalWithSection++;
    if (DEBIT_SECTIONS.has(sid) && t.type === 'CREDIT') debitSectionCredits++;
    if (CREDIT_SECTIONS.has(sid) && t.type === 'DEBIT') creditSectionDebits++;
  }

  // If we have section-tagged transactions and the majority contradict their
  // current sign, the flip is independently confirmed.
  const sectionFlipConfirmed =
    totalWithSection > 0 &&
    (debitSectionCredits + creditSectionDebits) / totalWithSection > 0.5;

  if (totalWithSection > 0 && !sectionFlipConfirmed) {
    logger.info('[CHECKSUM_MATRIX] COLUMN_FLIP section semantics do not confirm — skipping repair', {
      totalWithSection,
      debitSectionCredits,
      creditSectionDebits,
    });
    return { transactions, reconciliation, repaired: false, repairType: 'COLUMN_FLIP_DENIED' };
  }

  // Apply the remap: invert every transaction sign
  logger.info('[CHECKSUM_MATRIX] COLUMN_FLIP applying sign inversion repair');
  const flipped = transactions.map((t) => {
    const newType = t.type === 'CREDIT' ? 'DEBIT' : 'CREDIT';
    return { ...t, type: newType, amount: -t.amount };
  });

  // Re-run reconciliation
  const newReconciliation = reconcileFn(flipped, meta);

  if (newReconciliation?.checksumOk) {
    logger.info('[CHECKSUM_MATRIX] COLUMN_FLIP repair SUCCEEDED — checksum passes after remap');
    return {
      transactions: flipped,
      reconciliation: newReconciliation,
      repaired: true,
      repairType: 'COLUMN_FLIP',
    };
  }

  logger.warn('[CHECKSUM_MATRIX] COLUMN_FLIP repair FAILED — checksum still does not pass');
  return {
    transactions,
    reconciliation,
    repaired: false,
    repairType: 'COLUMN_FLIP_FAILED',
  };
}

export default { detectColumnFlip, attemptColumnFlipRepair };
