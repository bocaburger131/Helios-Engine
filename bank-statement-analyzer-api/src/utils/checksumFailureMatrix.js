/**
 * Bank-agnostic checksum failure classifier.
 * Labels why a statement failed the universal ledger gate (not printed SUMMARY identity alone).
 */

const TOLERANCE = 0.01;

/**
 * @param {object} recon — reconcileStatement result
 * @param {Array<object>} [transactions]
 * @returns {{
 *   class: string,
 *   severity: 'ok'|'warn'|'fail',
 *   printedIdentityOk: boolean,
 *   ledgerOk: boolean,
 *   activityOk: boolean,
 *   tierAOk: boolean,
 *   depositDelta: number|null,
 *   withdrawalDelta: number|null,
 *   topOutflows: Array<{amount:number, section:string|null, desc:string}>,
 *   hints: string[]
 * }}
 */
export function classifyChecksumFailure(recon, transactions = []) {
  const printedIdentityOk = Boolean(recon?.printedClosingMatch);
  const tierAOk = Boolean(recon?.checksumRecon?.ok);
  const activityOk =
    Boolean(recon?.depositsMatch) && Boolean(recon?.withdrawalsMatch);
  const ledgerOk = Boolean(recon?.checksumOk) || tierAOk || activityOk;

  const depositDelta =
    recon?.printedDeposits != null && recon?.parsedDeposits != null
      ? Number((Number(recon.parsedDeposits) - Number(recon.printedDeposits)).toFixed(2))
      : null;
  const withdrawalDelta =
    recon?.printedWithdrawals != null && recon?.parsedWithdrawals != null
      ? Number(
          (Number(recon.parsedWithdrawals) - Number(recon.printedWithdrawals)).toFixed(2)
        )
      : null;

  const topOutflows = [...(transactions || [])]
    .filter((t) => Number(t?.amount) < 0)
    .sort((a, b) => Math.abs(Number(b.amount)) - Math.abs(Number(a.amount)))
    .slice(0, 8)
    .map((t) => ({
      amount: Number(t.amount),
      section: t.section || t.sectionLabel || null,
      desc: String(t.description || '').slice(0, 80)
    }));

  const hints = [];
  let failureClass = 'OK';
  let severity = 'ok';

  if (ledgerOk && printedIdentityOk) {
    return {
      class: 'OK',
      severity: 'ok',
      printedIdentityOk,
      ledgerOk: true,
      activityOk,
      tierAOk,
      depositDelta,
      withdrawalDelta,
      topOutflows,
      hints: []
    };
  }

  if (printedIdentityOk && !activityOk && !tierAOk) {
    failureClass = 'FALSE_LAYOUT_PASS_RISK';
    severity = 'fail';
    hints.push(
      'Printed SUMMARY self-reconciles but parsed activity does not match — do not accept on identity alone'
    );
  }

  if (
    withdrawalDelta != null &&
    Math.abs(withdrawalDelta) > TOLERANCE &&
    withdrawalDelta > 0
  ) {
    failureClass = 'WITHDRAWAL_INFLATION';
    severity = 'fail';
    hints.push(
      `Parsed withdrawals exceed printed by $${withdrawalDelta.toFixed(2)} — suspect column bleed or check double-count`
    );
  } else if (
    depositDelta != null &&
    Math.abs(depositDelta) > TOLERANCE &&
    depositDelta > 0
  ) {
    failureClass = 'DEPOSIT_INFLATION';
    severity = 'fail';
    hints.push(
      `Parsed deposits exceed printed by $${depositDelta.toFixed(2)} — suspect daily-balance or balance-column bleed`
    );
  } else if (
    failureClass === 'OK' &&
    ((depositDelta != null && Math.abs(depositDelta) > TOLERANCE) ||
      (withdrawalDelta != null && Math.abs(withdrawalDelta) > TOLERANCE))
  ) {
    failureClass = 'AGGREGATE_MISMATCH';
    severity = 'fail';
    hints.push('Parsed activity totals do not match printed SUMMARY lines');
  } else if (failureClass === 'OK' && !printedIdentityOk) {
    failureClass = 'PRINTED_SUMMARY_MISPARSE';
    severity = 'fail';
    hints.push('Printed SUMMARY lines do not close (opening + credits − debits ≠ ending)');
  } else if (failureClass === 'OK' && !tierAOk) {
    failureClass = 'TIER_A_CLOSING_FAIL';
    severity = 'fail';
    hints.push('Ledger closing arithmetic failed (opening + parsed credits − debits ≠ ending)');
  }

  const maxOut = topOutflows[0];
  if (
    maxOut &&
    recon?.printedWithdrawals != null &&
    Math.abs(maxOut.amount) > Number(recon.printedWithdrawals) + TOLERANCE
  ) {
    hints.push(
      `Largest outflow ($${Math.abs(maxOut.amount).toFixed(2)}) exceeds printed withdrawals — bleed/outlier row`
    );
    if (failureClass === 'AGGREGATE_MISMATCH' || failureClass === 'FALSE_LAYOUT_PASS_RISK') {
      failureClass = 'BLEED_OUTLIER_ROW';
    }
  }

  return {
    class: failureClass,
    severity,
    printedIdentityOk,
    ledgerOk: Boolean(recon?.checksumOk),
    activityOk,
    tierAOk,
    depositDelta,
    withdrawalDelta,
    topOutflows,
    hints
  };
}

/**
 * Build a compact matrix row for one statement (batch diagnostics).
 * @param {{ fileName?: string, bank?: string, recon: object, transactions?: object[] }} input
 */
export function matrixRowForStatement(input) {
  const classified = classifyChecksumFailure(input.recon, input.transactions);
  return {
    fileName: input.fileName ?? null,
    bank: input.bank ?? null,
    ...classified
  };
}

export default { classifyChecksumFailure, matrixRowForStatement };
