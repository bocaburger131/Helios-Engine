/**
 * Statement data-access layer. Controllers call these instead of running
 * raw Mongoose queries, keeping DB logic out of request handlers.
 */
import Statement from '../../models/Statement.js';
import Transaction from '../../models/Transaction.js';

/**
 * Find a statement by id (lean).
 * @param {string} id
 * @returns {Promise<object|null>}
 */
export async function findByIdLean(id) {
  return Statement.findById(id).lean();
}

/**
 * Find a statement plus its transactions in one logical read.
 * @param {string} id
 * @returns {Promise<{ statement: object|null, transactions: object[] }>}
 */
export async function findByIdWithTransactions(id) {
  const statement = await Statement.findById(id).lean();
  if (!statement) return { statement: null, transactions: [] };
  const transactions = await Transaction.find({ statementId: id })
    .sort({ date: 1 })
    .lean();
  return { statement, transactions };
}

/**
 * List a user's statements filtered by date range, newest first.
 * @param {string} userId
 * @param {object} [dateFilter]
 * @param {string} [select] - projection string
 * @returns {Promise<object[]>}
 */
export async function findByUserMonthly(userId, dateFilter = {}, select = '') {
  let query = Statement.find({ user: userId, ...dateFilter });
  if (select) query = query.select(select);
  return query.sort({ uploadDate: -1 });
}

export default {
  findByIdLean,
  findByIdWithTransactions,
  findByUserMonthly
};
