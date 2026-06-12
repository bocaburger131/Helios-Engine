import { BaseRepository } from './repository.base.js';
import { StatementModel } from '../models/statement/Statement.js';

/**
 * Repository for bank statement operations
 */
export class StatementRepository extends BaseRepository {
  constructor() {
    super(StatementModel);
  }

  /**
   * Find statements for a specific user
   * @param {string} userId - User ID
   * @param {Object} options - Query options
   * @returns {Promise<Document[]>} User's statements
   */
  async findByUserId(userId, options = {}) {
    return this.find({ userId }, options);
  }

  /**
   * Find statements within a date range
   * @param {Date} startDate - Range start date
   * @param {Date} endDate - Range end date
   * @param {string} userId - Optional user ID filter
   * @returns {Promise<Document[]>} Matching statements
   */
  async findByDateRange(startDate, endDate, userId = null) {
    const query = {
      $or: [
        // Statements that start within the range
        {
          'statementPeriod.startDate': { 
            $gte: startDate, 
            $lte: endDate 
          }
        },
        // Statements that end within the range
        {
          'statementPeriod.endDate': { 
            $gte: startDate, 
            $lte: endDate 
          }
        },
        // Statements that completely span the range
        {
          'statementPeriod.startDate': { $lte: startDate },
          'statementPeriod.endDate': { $gte: endDate }
        }
      ]
    };
    
    // Add user filter if provided
    if (userId) {
      query.userId = userId;
    }
    
    return this.find(query);
  }

  /**
   * Update statement parse status
   * @param {string} id - Statement ID
   * @param {string} status - New status
   * @param {string} errorMessage - Optional error message
   * @returns {Promise<Document>} Updated statement
   */
  async updateParseStatus(id, status, errorMessage = null) {
    const update = { parseStatus: status };
    if (errorMessage) {
      update.parseError = errorMessage;
    }
    return this.updateById(id, update);
  }

  /**
   * Get financial summary for a user across all statements
   * @param {string} userId - User ID
   * @returns {Promise<Object>} Financial summary
   */
  async getFinancialSummary(userId) {
    const pipeline = [
      { $match: { userId: mongoose.Types.ObjectId(userId) } },
      { $unwind: '$transactions' },
      { $group: {
          _id: '$transactions.type',
          total: { $sum: '$transactions.amount' },
          count: { $sum: 1 }
        }
      },
      { $project: {
          _id: 0,
          type: '$_id',
          total: 1,
          count: 1
        }
      }
    ];
    
    return this.model.aggregate(pipeline);
  }

  /**
   * Add transactions to an existing statement
   * @param {string} id - Statement ID
   * @param {Array} transactions - Transactions to add
   * @returns {Promise<Document>} Updated statement
   */
  async addTransactions(id, transactions) {
    return this.model.findByIdAndUpdate(
      id,
      { $push: { transactions: { $each: transactions } } },
      { new: true }
    );
  }
}

// Create singleton instance for export
export const statementRepository = new StatementRepository();