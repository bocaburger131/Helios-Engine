import Transaction from '../models/Transaction.js';
import logger from '../utils/logger.js';

class TransactionService {
  /**
   * Saves an array of transaction data to the database.
   * @param {Array<object>} transactionData - An array of transaction objects to save.
   * @param {string} statementId - The ID of the parent statement.
   * @param {string} userId - The ID of the user who owns the statement.
   * @returns {Promise<Array<object>>} - A promise that resolves to an array of saved transaction documents.
   */
  async saveTransactions(transactionData, statementId, userId) {
    // --- BEGIN DEBUG LOG ---
    logger.debug('transactionService.saveTransactions called', {
      count: transactionData?.length,
      statementId,
      userId
    });

    if (!userId) {
      // Use a more descriptive error message
      throw new Error('A valid userId must be provided to save transactions.');
    }

    if (!Array.isArray(transactionData) || transactionData.length === 0) {
      return [];
    }

    // Single round-trip instead of one save() per transaction (N+1 fix).
    const docs = transactionData.map((txData) => ({
      statementId,
      userId,
      date: new Date(txData.date),
      description: txData.description,
      amount: txData.amount,
      type: txData.amount > 0 ? 'credit' : 'debit',
      balance: txData.balance,
      originalDescription: txData.description,
      metadata: {
        lineNumber: txData.lineNumber,
        rawText: txData.rawText,
      },
    }));
    const transactions = await Transaction.insertMany(docs);

    logger.info(`Saved ${transactions.length} transactions for statement ${statementId}`);
    return transactions;
  }
}

// Export a single instance (singleton pattern)
export default new TransactionService();
