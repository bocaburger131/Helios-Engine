/**
 * Universal reconciliation against printed monthly totals (all bank profiles).
 */
import { validateReconciliation } from '../templateGraduationService.js';
import riskAnalysisService from '../riskAnalysisService.js';
import { applyBalanceSequenceSigns, normalizeTransactionsForLedger } from '../../utils/transactionNormalization.js';
import logger from '../../utils/logger.js';

const TOLERANCE = 0.01;

/**
 * @param {object} meta
 * @param {Array<object>} transactions — ledger-shaped (signed amount)
 * @returns {object}
 */
export function reconcileStatement(meta, transactions) {
  let txs = Array.isArray(transactions) ? transactions : [];
  const opening = Number(meta?.openingBalance ?? 0);
  const closing = Number(meta?.closingBalance ?? 0);
  const printedDeposits = meta?.printedDeposits;
  const printedWithdrawals = meta?.printedWithdrawals;

  // ---- Balance-sequence sign inference (P0) ----
  // Uses the running balance column to correct misclassified CREDIT/DEBIT types.
  // Institution-agnostic: works for ALL banks, not just Wells Fargo.
  if (opening && txs.length > 0) {
    // Normalize balance field name — profiles may use 'endingDailyBalance' or 'balance'
    for (const t of txs) {
      if (t.balance == null && t.endingDailyBalance != null) {
        t.balance = t.endingDailyBalance;
      }
    }
    const beforeCounts = countByType(txs);
    const balCount = txs.filter(t => t.balance != null).length;
    const balSample = txs.filter(t => t.balance != null).slice(0, 3);
    logger.info('[RECONCILIATION] balance inference pre-check', {
      txnCount: txs.length,
      withBalance: balCount,
      opening,
      sample: balSample.map(t => ({ amt: t.amount, bal: t.balance, date: t.date, type: t.type })),
    });

    // PRESERVE the Python sidecar sign: only run balance inference on the subset
    // of rows that actually HAVE balance data. Rows without balance keep their
    // column-position-derived sign (deposits→CREDIT, withdrawals→DEBIT).
    // Make a copy with abs amounts for the inference function (which expects
    // positive amounts), then merge results back.
    const absTxs = txs.map(t => ({ ...t, amount: Math.abs(Number(t.amount) || 0) }));
    const signedTxs = applyBalanceSequenceSigns(absTxs, { openingBalance: opening });

    // Merge: for rows that had balance data AND were flipped by inference,
    // use the inferred sign. For all others, keep the original Python sign.
    for (let i = 0; i < txs.length; i++) {
      const orig = txs[i];
      const inferred = signedTxs[i];
      if (orig.balance != null && inferred && inferred.amount !== Math.abs(Number(orig.amount) || 0)) {
        // Balance inference flipped this row — use the inferred sign
        orig.amount = inferred.amount;
        orig.type = inferred.type;
      }
      // else: keep original Python-sidecar sign (already correct from column position)
    }

    txs = normalizeTransactionsForLedger(txs);
    const afterCounts = countByType(txs);
    const flipped = beforeCounts.CREDIT - afterCounts.CREDIT;
    if (flipped !== 0) {
      logger.info('[RECONCILIATION] balance-sequence sign inference applied', {
        flipped,
        creditBefore: beforeCounts.CREDIT,
        creditAfter: afterCounts.CREDIT,
        debitBefore: beforeCounts.DEBIT,
        debitAfter: afterCounts.DEBIT,
      });
    }
  }

  const { totalDeposits, totalWithdrawals } =
    riskAnalysisService.calculateTotalDepositsAndWithdrawals(txs);

  const parsedDeposits = Number(totalDeposits.toFixed(2));
  const parsedWithdrawals = Number(totalWithdrawals.toFixed(2));

  const checksumRecon = validateReconciliation({
    transactions: txs,
    openingBalance: opening,
    closingBalance: closing,
    balances: { opening, closing }
  });

  const computedClosing = Number((opening + parsedDeposits - parsedWithdrawals).toFixed(2));

  let depositsMatch = true;
  let withdrawalsMatch = true;
  if (printedDeposits != null && Number.isFinite(Number(printedDeposits))) {
    depositsMatch = Math.abs(parsedDeposits - Number(printedDeposits)) <= TOLERANCE;
  }
  if (printedWithdrawals != null && Number.isFinite(Number(printedWithdrawals))) {
    withdrawalsMatch = Math.abs(parsedWithdrawals - Number(printedWithdrawals)) <= TOLERANCE;
  }

  const closingMatch = Math.abs(computedClosing - closing) <= TOLERANCE;

  const checksumOk =
    Boolean(checksumRecon.ok) &&
    depositsMatch &&
    withdrawalsMatch &&
    closingMatch;

  return {
    checksumOk,
    parsedDeposits,
    parsedWithdrawals,
    computedClosing,
    depositsMatch,
    withdrawalsMatch,
    closingMatch,
    checksumRecon,
    opening,
    closing,
    printedDeposits: printedDeposits != null ? Number(printedDeposits) : null,
    printedWithdrawals: printedWithdrawals != null ? Number(printedWithdrawals) : null
  };
}

/**
 * @param {Array<object>} normalizedTxns — with postedDate, endingDailyBalance
 * @returns {{ valid: boolean, violations: number }}
 */
export function validateEndingDailyBalancePlacement(normalizedTxns) {
  const byDate = new Map();
  for (const t of normalizedTxns || []) {
    const d = t.postedDate || t.date;
    if (!d) continue;
    if (!byDate.has(d)) byDate.set(d, []);
    byDate.get(d).push(t);
  }
  let violations = 0;
  for (const rows of byDate.values()) {
    const withBal = rows.filter((r) => r.endingDailyBalance != null);
    if (withBal.length === 0) continue;
    const last = rows[rows.length - 1];
    for (const r of rows) {
      if (r.endingDailyBalance != null && r !== last) violations += 1;
    }
  }
  return { valid: violations === 0, violations };
}

export default { reconcileStatement, validateEndingDailyBalancePlacement };

// ---- Internal helpers ----

function countByType(transactions) {
  let CREDIT = 0;
  let DEBIT = 0;
  for (const t of transactions) {
    const ty = (t?.type || '').toUpperCase();
    if (ty === 'CREDIT') CREDIT++;
    else if (ty === 'DEBIT') DEBIT++;
  }
  return { CREDIT, DEBIT };
}
