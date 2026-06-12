/**
 * Ledger-normalized transaction helpers: signed amounts (credits +, debits -)
 * and consistent CREDIT/DEBIT typing for analytics.
 */

/**
 * @param {string|undefined|null} raw
 * @returns {'CREDIT'|'DEBIT'|null}
 */
export function normalizeLedgerType(raw) {
  if (raw === undefined || raw === null || raw === '') return null;
  const u = String(raw).toUpperCase().trim();
  if (['CREDIT', 'DEPOSIT', 'CR', 'INFLOW'].includes(u)) return 'CREDIT';
  if (['DEBIT', 'WITHDRAWAL', 'DR', 'WD', 'OUTFLOW'].includes(u)) return 'DEBIT';
  return null;
}

/**
 * Apply bank-style type to unsigned amounts: positive DEBIT -> negative amount.
 * Idempotent when type and sign already agree.
 * @param {Object} tx
 * @returns {Object} shallow clone with normalized amount and type
 */
export function normalizeTransactionForLedger(tx) {
  if (!tx || typeof tx !== 'object') return tx;

  const out = { ...tx };
  let amt = Number(out.amount);
  if (!Number.isFinite(amt)) {
    return out;
  }

  const ty = normalizeLedgerType(out.type);

  if (ty === 'DEBIT' && amt > 0) {
    amt = -Math.abs(amt);
  } else if (ty === 'CREDIT' && amt < 0) {
    amt = Math.abs(amt);
  }

  out.amount = Math.round(amt * 100) / 100;
  out.type = out.amount >= 0 ? 'CREDIT' : 'DEBIT';
  return out;
}

export function normalizeTransactionsForLedger(transactions) {
  if (!Array.isArray(transactions)) return [];
  return transactions.map((t) => normalizeTransactionForLedger(t));
}

const BALANCE_SIGN_TOL = 0.02;

/**
 * When PDF gives all-positive amounts without type, infer debits from running balance column:
 * prevBalance ± amount ≈ currentBalance.
 * @param {Array<Object>} transactions
 * @returns {Array<Object>} new array (does not mutate input objects in place — shallow copies per row)
 */
export function applyBalanceSequenceSigns(transactions, options = {}) {
  if (!Array.isArray(transactions) || transactions.length === 0) {
    return transactions ? [...transactions] : [];
  }

  const openingBalance = Number(options.openingBalance);
  const hasOpening = Number.isFinite(openingBalance);

  const rows = transactions.map((t, i) => ({
    tx: { ...t },
    origIndex: i,
    lineNumber: t.lineNumber ?? i
  }));

  rows.sort((a, b) => {
    const da = new Date(a.tx.date).getTime();
    const db = new Date(b.tx.date).getTime();
    const validA = !Number.isNaN(da);
    const validB = !Number.isNaN(db);
    if (validA && validB && da !== db) return da - db;
    if (validA && !validB) return -1;
    if (!validA && validB) return 1;
    return a.lineNumber - b.lineNumber;
  });

  for (let idx = 0; idx < rows.length; idx++) {
    const cur = rows[idx].tx;
    const curBal = Number(cur.balance);
    let amt = Number(cur.amount);
    if (!Number.isFinite(curBal) || !Number.isFinite(amt) || amt === 0) continue;

    const prevBal =
      idx > 0
        ? Number(rows[idx - 1].tx.balance)
        : hasOpening
          ? openingBalance
          : NaN;
    if (!Number.isFinite(prevBal)) continue;

    const absAmt = Math.abs(amt);
    const errCredit = Math.abs(prevBal + absAmt - curBal);
    const errDebit = Math.abs(prevBal - absAmt - curBal);

    if (errDebit < errCredit && errDebit <= BALANCE_SIGN_TOL) {
      cur.amount = -absAmt;
      cur.type = 'DEBIT';
    } else if (errCredit <= BALANCE_SIGN_TOL) {
      cur.amount = absAmt;
      cur.type = 'CREDIT';
    }
  }

  rows.sort((a, b) => a.origIndex - b.origIndex);
  return rows.map((r) => r.tx);
}

/**
 * Apply balance-sequence inference then ledger normalization (type + explicit DEBIT amounts).
 * @param {Array<Object>} transactions
 * @returns {Array<Object>}
 */
/**
 * Drop rows where amount was mis-parsed from the running balance column.
 * @param {Array<Object>} transactions
 */
export function dropBalanceColumnDuplicates(transactions) {
  if (!Array.isArray(transactions)) return [];
  return transactions.filter((t) => {
    const amt = Math.abs(Number(t?.amount));
    const bal = Math.abs(Number(t?.balance));
    if (!Number.isFinite(amt) || amt === 0) return true;
    if (!Number.isFinite(bal) || bal === 0) return true;
    if (Math.abs(amt - bal) < 0.02) return false;
    return true;
  });
}

export function normalizeTransactionsWithBalanceInference(transactions, options = {}) {
  const cleaned = dropBalanceColumnDuplicates(transactions);
  const signed = applyBalanceSequenceSigns(cleaned, options);
  return normalizeTransactionsForLedger(signed);
}

/**
 * For analytics when type may be legacy (deposit/withdrawal) or missing.
 * @param {Object} tx
 * @returns {boolean}
 */
export function isLedgerInflow(tx) {
  const ty = normalizeLedgerType(tx?.type);
  if (ty === 'CREDIT') return true;
  if (ty === 'DEBIT') return false;
  return Number(tx?.amount) > 0;
}

export function isLedgerOutflow(tx) {
  const ty = normalizeLedgerType(tx?.type);
  if (ty === 'DEBIT') return true;
  if (ty === 'CREDIT') return false;
  return Number(tx?.amount) < 0;
}
