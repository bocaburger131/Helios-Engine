/**
 * Transaction data-access layer.
 */
import Transaction from '../../models/Transaction.js';

/**
 * All transactions for a statement, oldest first.
 * @param {string} statementId
 * @returns {Promise<object[]>}
 */
export async function findByStatement(statementId) {
  return Transaction.find({ statementId }).sort({ date: 1 }).lean();
}

/**
 * Apply categorization updates in one round-trip per batch.
 * @param {Array<{ filter: object, update: object }>} ops - updateOne ops
 * @returns {Promise<{ modifiedCount: number, upsertedCount: number }>}
 */
export async function bulkCategorize(ops) {
  if (!Array.isArray(ops) || ops.length === 0) {
    return { modifiedCount: 0, upsertedCount: 0 };
  }
  const result = await Transaction.bulkWrite(
    ops.map((op) => ({ updateOne: op }))
  );
  return {
    modifiedCount: result.modifiedCount || 0,
    upsertedCount: result.upsertedCount || 0
  };
}

export default {
  findByStatement,
  bulkCategorize
};
