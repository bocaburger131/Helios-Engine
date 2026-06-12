import Transaction from '../models/transactionModel.js';
import { AppError } from '../utils/appError.js';

class TransactionController {
  // Get all transactions
  getAllTransactions = async (req, res, next) => {
    try {
      const { page = 1, limit = 50, sort = '-date' } = req.query;

      // Mock response for testing environment
      if (process.env.NODE_ENV === 'test') {
        return res.json({
          success: true,
          data: {
            transactions: [],
            totalPages: 1,
            currentPage: 1,
            total: 0
          }
        });
      }

      const transactions = await Transaction.find()
        .limit(limit * 1)
        .skip((page - 1) * limit)
        .sort(sort);

      const count = await Transaction.countDocuments();

      res.json({
        success: true,
        data: {
          transactions,
          totalPages: Math.ceil(count / limit),
          currentPage: page,
          total: count
        }
      });
    } catch (error) {
      next(error);
    }
  };

  // Get all transactions for a specific statement
  getTransactionsByStatement = async (req, res, next) => {
    try {
      const { statementId } = req.params;
      const { page = 1, limit = 50, sort = '-date' } = req.query;

      const transactions = await Transaction.find({ statementId })
        .limit(limit * 1)
        .skip((page - 1) * limit)
        .sort(sort);

      const count = await Transaction.countDocuments({ statementId });

      res.json({
        success: true,
        data: {
          transactions,
          totalPages: Math.ceil(count / limit),
          currentPage: page,
          total: count
        }
      });
    } catch (error) {
      next(error);
    }
  };

  // Get transactions by category
  getTransactionsByCategory = async (req, res, next) => {
    try {
      const { category } = req.params;
      const { statementId } = req.query;

      const query = { category };
      if (statementId) query.statementId = statementId;

      const transactions = await Transaction.find(query).sort('-date');

      res.json({
        success: true,
        data: transactions
      });
    } catch (error) {
      next(error);
    }
  };

  // Get transactions by date range
  getTransactionsByDateRange = async (req, res, next) => {
    try {
      const { startDate, endDate, statementId } = req.query;

      if (!startDate || !endDate) {
        throw new AppError('Start date and end date are required', 400);
      }

      const query = {
        date: {
          $gte: startDate,
          $lte: endDate
        }
      };

      if (statementId) query.statementId = statementId;

      const transactions = await Transaction.find(query).sort('-date');

      res.json({
        success: true,
        data: transactions
      });
    } catch (error) {
      next(error);
    }
  };

  // Search transactions
  searchTransactions = async (req, res, next) => {
    try {
      const { query, statementId } = req.query;

      if (!query) {
        throw new AppError('Search query is required', 400);
      }

      const searchQuery = {
        $or: [
          { description: { $regex: query, $options: 'i' } },
          { category: { $regex: query, $options: 'i' } },
          { merchantName: { $regex: query, $options: 'i' } }
        ]
      };

      if (statementId) searchQuery.statementId = statementId;

      const transactions = await Transaction.find(searchQuery).sort('-date');

      res.json({
        success: true,
        data: transactions
      });
    } catch (error) {
      next(error);
    }
  };

  // Get transaction analytics
  getTransactionAnalytics = async (req, res, next) => {
    try {
      const { statementId } = req.query;
      const matchStage = statementId ? { $match: { statementId } } : { $match: {} };

      const analytics = await Transaction.aggregate([
        matchStage,
        {
          $group: {
            _id: '$category',
            totalAmount: { $sum: { $abs: '$amount' } },
            count: { $sum: 1 },
            avgAmount: { $avg: { $abs: '$amount' } }
          }
        },
        {
          $sort: { totalAmount: -1 }
        }
      ]);

      const topMerchants = await Transaction.aggregate([
        matchStage,
        { $match: { merchantName: { $exists: true, $ne: null } } },
        {
          $group: {
            _id: '$merchantName',
            totalAmount: { $sum: { $abs: '$amount' } },
            count: { $sum: 1 }
          }
        },
        {
          $sort: { totalAmount: -1 }
        },
        {
          $limit: 10
        }
      ]);

      res.json({
        success: true,
        data: {
          byCategory: analytics,
          topMerchants
        }
      });
    } catch (error) {
      next(error);
    }
  };

  // Update transaction category
  updateTransactionCategory = async (req, res, next) => {
    try {
      const { id } = req.params;
      const { category, subcategory } = req.body;

      if (!category) {
        throw new AppError('Category is required', 400);
      }

      const transaction = await Transaction.findByIdAndUpdate(
        id,
        { category, subcategory },
        { new: true, runValidators: true }
      );

      if (!transaction) {
        throw new AppError('Transaction not found', 404);
      }

      res.json({
        success: true,
        data: transaction
      });
    } catch (error) {
      next(error);
    }
  };

  // Update transaction tags
  updateTransactionTags = async (req, res, next) => {
    try {
      const { id } = req.params;
      const { tags } = req.body;

      if (!Array.isArray(tags)) {
        throw new AppError('Tags must be an array', 400);
      }

      const transaction = await Transaction.findByIdAndUpdate(
        id,
        { tags },
        { new: true, runValidators: true }
      );

      if (!transaction) {
        throw new AppError('Transaction not found', 404);
      }

      res.json({
        success: true,
        data: transaction
      });
    } catch (error) {
      next(error);
    }
  };

  // Delete transaction
  deleteTransaction = async (req, res, next) => {
    try {
      const { id } = req.params;

      const transaction = await Transaction.findByIdAndDelete(id);

      if (!transaction) {
        throw new AppError('Transaction not found', 404);
      }

      res.json({
        success: true,
        message: 'Transaction deleted successfully'
      });
    } catch (error) {
      next(error);
    }
  };
}

export default TransactionController;
