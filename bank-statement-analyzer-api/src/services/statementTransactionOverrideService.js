import mongoose from 'mongoose';
import Transaction from '../models/Transaction.js';
import { validateCategorizerOverrideBody } from '../utils/categorizerTaxonomy.js';

/**
 * Apply analyst category override for a statement-scoped transaction.
 * @param {string} statementId
 * @param {string} txnId
 * @param {{ category?: string, subcategory?: string, taxDeductible?: string }} body
 * @returns {Promise<{ ok: true, transaction: object, vitals: object } | { ok: false, status: number, error: string }>}
 */
export async function patchStatementTransactionOverride(statementId, txnId, body = {}) {
  if (!mongoose.isValidObjectId(statementId)) {
    return { ok: false, status: 400, error: 'Invalid statement id' };
  }
  if (!mongoose.isValidObjectId(txnId)) {
    return { ok: false, status: 400, error: 'Invalid transaction id' };
  }

  const validated = validateCategorizerOverrideBody(body);
  if (!validated.ok) {
    return { ok: false, status: 400, error: validated.error };
  }

  /** @type {Record<string, unknown>} */
  const $set = {
    category: validated.category,
    categorizationSource: 'analyst_override',
    'flags.isReviewed': true
  };
  if (body.subcategory !== undefined) {
    $set.subcategory = validated.subcategory || null;
  }
  if (validated.taxDeductible != null) {
    $set.taxDeductible = validated.taxDeductible;
  }

  const transaction = await Transaction.findOneAndUpdate(
    { _id: txnId, statementId },
    { $set },
    { new: true, runValidators: true }
  ).lean();

  if (!transaction) {
    return { ok: false, status: 404, error: 'Transaction not found for this statement' };
  }

  const vitals = await rollupStatementCategorizerVitals(statementId);
  return { ok: true, transaction, vitals };
}

/**
 * Lightweight expense/revenue rollup for categorizer UI refresh.
 * @param {string} statementId
 */
export async function rollupStatementCategorizerVitals(statementId) {
  const rows = await Transaction.find({ statementId }).select('type amount category').lean();
  let trueMonthlyRevenue = 0;
  let totalOpex = 0;
  let totalCogs = 0;
  let totalPayroll = 0;
  let totalDebtService = 0;
  let netCashFlow = 0;

  for (const row of rows) {
    const amt = Math.abs(Number(row.amount) || 0);
    const type = String(row.type || '').toUpperCase();
    const cat = String(row.category || '').toUpperCase();
    const isCredit = type === 'CREDIT';
    const isDebit = type === 'DEBIT';

    if (isCredit) {
      const excluded =
        cat.includes('NON-REVENUE') ||
        cat.includes('TRANSFER') ||
        cat === 'EXCLUDED' ||
        cat.includes('HIGH-RISK') ||
        cat.includes('HIGH RISK');
      if (!excluded) trueMonthlyRevenue += amt;
      netCashFlow += amt;
    } else if (isDebit) {
      netCashFlow -= amt;
      if (cat === 'COGS' || cat.includes('COGS')) totalCogs += amt;
      else if (cat === 'PAYROLL' || cat.includes('PAYROLL')) totalPayroll += amt;
      else if (cat.includes('DEBT')) totalDebtService += amt;
      else if (cat === 'OPEX' || cat.includes('OPEX') || cat.includes('OPERATIONS')) {
        totalOpex += amt;
      }
    }
  }

  return {
    trueMonthlyRevenue,
    totalOpex,
    totalCogs,
    totalPayroll,
    totalDebtService,
    netCashFlow
  };
}
