/**
 * Universal reconciliation against printed monthly totals (all bank profiles).
 */
import { validateReconciliation } from '../templateGraduationService.js';
import riskAnalysisService from '../riskAnalysisService.js';

const TOLERANCE = 0.01;

const round2 = (n) => Number((Number(n) || 0).toFixed(2));

/**
 * Map a free-text transaction section label onto a spec line key.
 * @param {string} label
 * @param {{ summaryLines: Array<{key:string, labels:RegExp[]}> }} spec
 * @returns {string|null}
 */
function sectionKeyForLabel(label, spec) {
  const s = String(label || '').trim();
  if (!s || !spec?.summaryLines) return null;
  // Fast path: row already tagged with a canonical spec key.
  const direct = spec.summaryLines.find((def) => def.key.toLowerCase() === s.toLowerCase());
  if (direct) return direct.key;
  // Specific labels (returnedChecks) precede generic (checks) in spec order.
  for (const def of spec.summaryLines) {
    if (def.labels.some((re) => re.test(s))) return def.key;
  }
  return null;
}

/**
 * Sum parsed ledger amounts grouped by spec line key, using each row's section tag.
 * @param {Array<object>} txs
 * @param {{ summaryLines: Array<{key:string, labels:RegExp[], role:string}> }} spec
 * @returns {Record<string, number>}
 */
function computeSectionTotals(txs, spec) {
  const totals = {};
  if (!spec?.summaryLines) return totals;
  for (const t of txs) {
    const key = sectionKeyForLabel(t.section ?? t.sectionLabel, spec);
    if (!key) continue;
    totals[key] = (totals[key] ?? 0) + Math.abs(Number(t.amount) || 0);
  }
  for (const k of Object.keys(totals)) totals[k] = round2(totals[k]);
  return totals;
}

/**
 * Per-line printed-vs-parsed comparison for the dashboard.
 * @returns {Record<string, {printed:number|null, parsed:number|null, delta:number|null, role:string, match:boolean}>}
 */
function computeLineDeltas(printedLines, sectionTotals, spec) {
  const deltas = {};
  if (!spec?.summaryLines) return deltas;
  for (const def of spec.summaryLines) {
    const printed = printedLines?.[def.key];
    const parsed = sectionTotals?.[def.key];
    const hasPrinted = printed != null && Number.isFinite(Number(printed));
    const hasParsed = parsed != null && Number.isFinite(Number(parsed));
    if (!hasPrinted && !hasParsed) continue;
    const delta = hasPrinted && hasParsed ? round2(Number(parsed) - Number(printed)) : null;
    deltas[def.key] = {
      printed: hasPrinted ? round2(printed) : null,
      parsed: hasParsed ? round2(parsed) : null,
      delta,
      role: def.role,
      // Only meaningful when section tags exist; absence is not a hard failure.
      match: delta == null ? !hasParsed : Math.abs(delta) <= TOLERANCE
    };
  }
  return deltas;
}

/**
 * Printed-side closing identity: opening + Σ(printed credits) − Σ(printed debits).
 * @returns {{ printedComputedClosing: number|null, printedClosingMatch: boolean }}
 */
function computePrintedClosingIdentity(opening, closing, printedLines, spec) {
  if (!spec?.summaryLines || !printedLines) {
    return { printedComputedClosing: null, printedClosingMatch: true };
  }
  let credit = 0;
  let debit = 0;
  let any = false;
  for (const def of spec.summaryLines) {
    const v = printedLines[def.key];
    if (v == null || !Number.isFinite(Number(v))) continue;
    any = true;
    if (def.role === 'credit') credit += Math.abs(Number(v));
    else if (def.role === 'debit') debit += Math.abs(Number(v));
  }
  if (!any) return { printedComputedClosing: null, printedClosingMatch: true };
  const printedComputedClosing = round2(opening + credit - debit);
  return {
    printedComputedClosing,
    printedClosingMatch: Math.abs(printedComputedClosing - closing) <= TOLERANCE
  };
}

/**
 * @param {object} meta — may carry printedLines + reconciliationSpec for spec-aware recon
 * @param {Array<object>} transactions — ledger-shaped (signed amount, optional section tag)
 * @returns {object}
 */
export function reconcileStatement(meta, transactions) {
  const txs = Array.isArray(transactions) ? transactions : [];
  const opening = Number(meta?.openingBalance ?? 0);
  const closing = Number(meta?.closingBalance ?? 0);
  const printedDeposits = meta?.printedDeposits;
  const printedWithdrawals = meta?.printedWithdrawals;
  const spec = meta?.reconciliationSpec ?? null;
  const printedLines = meta?.printedLines ?? null;

  const { totalDeposits, totalWithdrawals } =
    riskAnalysisService.calculateTotalDepositsAndWithdrawals(txs);

  const parsedDeposits = round2(totalDeposits);
  const parsedWithdrawals = round2(totalWithdrawals);

  const checksumRecon = validateReconciliation({
    transactions: txs,
    openingBalance: opening,
    closingBalance: closing,
    balances: { opening, closing }
  });

  const computedClosing = round2(opening + parsedDeposits - parsedWithdrawals);

  let depositsMatch = true;
  let withdrawalsMatch = true;
  if (printedDeposits != null && Number.isFinite(Number(printedDeposits))) {
    depositsMatch = Math.abs(parsedDeposits - Number(printedDeposits)) <= TOLERANCE;
  }
  if (printedWithdrawals != null && Number.isFinite(Number(printedWithdrawals))) {
    withdrawalsMatch = Math.abs(parsedWithdrawals - Number(printedWithdrawals)) <= TOLERANCE;
  }

  const closingMatch = Math.abs(computedClosing - closing) <= TOLERANCE;

  const sectionTotals = computeSectionTotals(txs, spec);
  const lineDeltas = computeLineDeltas(printedLines, sectionTotals, spec);
  const { printedComputedClosing, printedClosingMatch } = computePrintedClosingIdentity(
    opening,
    closing,
    printedLines,
    spec
  );

  // Universal ledger gate (any bank / any company):
  // 1) Ledger quality: Tier-A closing on parsed rows OR printed activity match
  // 2) Closing integrity: printed SUMMARY identity when multi-line SUMMARY exists,
  //    else Tier-A/closingMatch on the stated ending balance
  // Printed identity alone never passes — empty/wrong ledgers always self-reconcile on paper.
  const hasSpecLines =
    Boolean(spec) && printedLines != null && Object.keys(printedLines).length > 0;

  const sectionReconciled = hasSpecLines
    ? Object.values(lineDeltas).every((d) => d.match)
    : null;

  const activityOk = depositsMatch && withdrawalsMatch;
  const tierAOk = Boolean(checksumRecon.ok);
  const ledgerQualityOk = tierAOk || activityOk;
  const hasPrintedActivity =
    (printedDeposits != null && Number.isFinite(Number(printedDeposits))) ||
    (printedWithdrawals != null && Number.isFinite(Number(printedWithdrawals)));

  let checksumOk;
  if (hasSpecLines) {
    checksumOk = ledgerQualityOk && printedClosingMatch;
  } else if (hasPrintedActivity) {
    checksumOk = ledgerQualityOk && closingMatch;
  } else {
    checksumOk = tierAOk && closingMatch;
  }
  const ledgerOk = checksumOk;

  return {
    checksumOk,
    ledgerOk,
    activityOk,
    tierAOk,
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
    printedWithdrawals: printedWithdrawals != null ? Number(printedWithdrawals) : null,
    printedLines: printedLines ?? null,
    sectionTotals,
    lineDeltas,
    printedComputedClosing,
    printedClosingMatch,
    sectionReconciled
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

/**
 * Row-level micro-checksum: Previous + Deposit − Withdrawal = Balance.
 * Skips rows without a usable balance. Tolerance ±$0.01.
 * @param {Array<object>} transactions
 * @param {{ openingBalance?: number }} [opts]
 * @returns {{ ok: boolean, violations: Array<object> }}
 */
export function validateRowRunningBalances(transactions, opts = {}) {
  const txs = Array.isArray(transactions) ? transactions : [];
  const violations = [];
  let prevBalance =
    opts.openingBalance != null && Number.isFinite(Number(opts.openingBalance))
      ? round2(opts.openingBalance)
      : null;

  for (let rowIndex = 0; rowIndex < txs.length; rowIndex++) {
    const t = txs[rowIndex];
    if (!t || t.parseExcluded || t.excludeFromMacroTotals) continue;

    const balRaw = t.balance ?? t.endingDailyBalance ?? t.runningBalance;
    if (balRaw == null || balRaw === '') continue;
    const balance = round2(balRaw);
    if (!Number.isFinite(balance)) continue;

    if (prevBalance == null) {
      prevBalance = balance;
      continue;
    }

    let deposit = 0;
    let withdrawal = 0;
    if (t.deposit != null || t.credit != null) {
      deposit = Math.abs(Number(t.deposit ?? t.credit) || 0);
    }
    if (t.withdrawal != null || t.debit != null) {
      withdrawal = Math.abs(Number(t.withdrawal ?? t.debit) || 0);
    }
    if (deposit === 0 && withdrawal === 0) {
      const amt = Number(t.amount);
      if (Number.isFinite(amt)) {
        if (amt >= 0) deposit = Math.abs(amt);
        else withdrawal = Math.abs(amt);
      }
    }

    const expected = round2(prevBalance + deposit - withdrawal);
    const delta = round2(expected - balance);
    if (Math.abs(delta) > TOLERANCE) {
      violations.push({
        page: t.page ?? t.pageIndex ?? t.pageNumber ?? null,
        rowIndex,
        delta,
        previous: prevBalance,
        deposit: round2(deposit),
        withdrawal: round2(withdrawal),
        balance,
        description: t.description || t.desc || null
      });
    }
    prevBalance = balance;
  }

  return { ok: violations.length === 0, violations };
}

export default {
  reconcileStatement,
  validateEndingDailyBalancePlacement,
  validateRowRunningBalances
};
