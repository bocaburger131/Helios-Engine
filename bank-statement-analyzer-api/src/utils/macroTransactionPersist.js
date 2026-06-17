/**
 * Persist macro-batch transactions to the Transaction collection for chart drill-down.
 */

const CHUNK_SIZE = 500;

export { CHUNK_SIZE };

/**
 * @param {Array<object>} transactions
 * @param {{ statementId: import('mongoose').Types.ObjectId, userId: import('mongoose').Types.ObjectId }} ctx
 */
export function buildMacroTransactionDocs(transactions, ctx) {
  const skipped = { invalidDate: 0, invalidAmount: 0 };
  const txnDocs = [];

  for (const t of transactions || []) {
    const d = t.date || t.transactionDate ? new Date(t.date || t.transactionDate) : null;
    if (!d || Number.isNaN(d.getTime())) {
      skipped.invalidDate += 1;
      continue;
    }
    const amt = Number(t.amount);
    if (!Number.isFinite(amt)) {
      skipped.invalidAmount += 1;
      continue;
    }
    const ty =
      t.type === 'DEBIT' || t.type === 'debit' || amt < 0 ? 'DEBIT' : 'CREDIT';
    txnDocs.push({
      statementId: ctx.statementId,
      userId: ctx.userId,
      date: d,
      description: String(t.description || 'Transaction').slice(0, 500),
      amount: amt,
      type: ty,
      category: String(t.category || 'OTHER').slice(0, 50).toUpperCase()
    });
  }

  return { txnDocs, skipped, attempted: (transactions || []).length };
}

/**
 * @param {import('mongoose').Model} TransactionModel
 * @param {Array<object>} txnDocs
 */
export async function insertTransactionDocsChunked(TransactionModel, txnDocs) {
  let persisted = 0;
  let writeErrors = 0;
  let error = null;

  for (let i = 0; i < txnDocs.length; i += CHUNK_SIZE) {
    const chunk = txnDocs.slice(i, i + CHUNK_SIZE);
    try {
      const result = await TransactionModel.insertMany(chunk, { ordered: false });
      persisted += result.length;
    } catch (err) {
      const inserted = err?.insertedDocs?.length ?? 0;
      persisted += inserted;
      const errs = err?.writeErrors ?? err?.result?.getWriteErrors?.() ?? [];
      writeErrors += Array.isArray(errs) ? errs.length : 1;
      error = err?.message || String(err);
    }
  }

  return { persisted, writeErrors, error };
}

/**
 * @param {import('mongoose').Model} TransactionModel
 * @param {Array<object>} transactions
 * @param {{ statementId: object, userId: object }} ctx
 */
export async function persistMacroTransactions(TransactionModel, transactions, ctx) {
  const { txnDocs, skipped, attempted } = buildMacroTransactionDocs(transactions, ctx);

  if (txnDocs.length === 0) {
    return {
      attempted,
      persisted: 0,
      skipped,
      writeErrors: 0,
      error: attempted > 0 ? 'All rows skipped (invalid date/amount)' : null
    };
  }

  const { persisted, writeErrors, error } = await insertTransactionDocsChunked(
    TransactionModel,
    txnDocs
  );

  return {
    attempted,
    persisted,
    skipped,
    writeErrors,
    error: persisted < txnDocs.length && error ? error : null
  };
}

export default {
  buildMacroTransactionDocs,
  insertTransactionDocsChunked,
  persistMacroTransactions,
  CHUNK_SIZE
};
