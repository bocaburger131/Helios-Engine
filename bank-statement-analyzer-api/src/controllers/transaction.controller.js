import { TransactionModel } from '../models/transaction/Transaction.js';
import { StatementModel } from '../models/statement/Statement.js';

export class TransactionController {
  /**
   * Get all transactions for a user
   */
  getUserTransactions = async (req, res) => {
    try {
      const userId = req.user.id;
      const { page = 1, limit = 20, category, startDate, endDate, type, search } = req.query;
      
      // Build query
      const query = { userId };
      
      if (category) {
        query.category = category;
      }
      
      if (type) {
        query.type = type;
      }
      
      if (startDate && endDate) {
        query.date = { $gte: new Date(startDate), $lte: new Date(endDate) };
      } else if (startDate) {
        query.date = { $gte: new Date(startDate) };
      } else if (endDate) {
        query.date = { $lte: new Date(endDate) };
      }
      
      if (search) {
        query.$or = [
          { description: { $regex: search, $options: 'i' } },
          { merchant: { $regex: search, $options: 'i' } }
        ];
      }
      
      // Execute query with pagination
      const transactions = await TransactionModel.find(query)
        .sort({ date: -1 })
        .skip((page - 1) * limit)
        .limit(Number(limit));
        
      // Get total count for pagination
      const total = await TransactionModel.countDocuments(query);
      
      res.json({
        transactions,
        pagination: {
          total,
          page: Number(page),
          limit: Number(limit),
          pages: Math.ceil(total / limit)
        }
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  };
  
  /**
   * Get a transaction by ID
   */
  getTransaction = async (req, res) => {
    try {
      const { id } = req.params;
      const transaction = await TransactionModel.findById(id);
      
      if (!transaction) {
        return res.status(404).json({ error: 'Transaction not found' });
      }
      
      // Get the statement to check ownership
      const statement = await StatementModel.findById(transaction.statementId);
      
      if (!statement) {
        return res.status(404).json({ error: 'Associated statement not found' });
      }
      
      // Check if statement belongs to the authenticated user
      if (statement.userId.toString() !== req.user.id) {
        return res.status(403).json({ error: 'Unauthorized access to transaction' });
      }
      
      res.json(transaction);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  };
  
  /**
   * Update a transaction
   */
  updateTransaction = async (req, res) => {
    try {
      const { id } = req.params;
      const transaction = await TransactionModel.findById(id);
      
      if (!transaction) {
        return res.status(404).json({ error: 'Transaction not found' });
      }
      
      // Get the statement to check ownership
      const statement = await StatementModel.findById(transaction.statementId);
      
      if (!statement) {
        return res.status(404).json({ error: 'Associated statement not found' });
      }
      
      // Check if statement belongs to the authenticated user
      if (statement.userId.toString() !== req.user.id) {
        return res.status(403).json({ error: 'Unauthorized access to transaction' });
      }
      
      // Fields that can be updated
      const allowedUpdates = ['description', 'category', 'notes'];
      
      // Update only allowed fields
      allowedUpdates.forEach(field => {
        if (req.body[field] !== undefined) {
          transaction[field] = req.body[field];
        }
      });
      
      await transaction.save();
      
      res.json(transaction);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  };
  
  /**
   * Update multiple transactions at once (bulk update)
   */
  bulkUpdateTransactions = async (req, res) => {
    try {
      const { transactionIds, updates } = req.body;
      
      if (!transactionIds || !Array.isArray(transactionIds) || transactionIds.length === 0) {
        return res.status(400).json({ error: 'Transaction IDs array is required' });
      }
      
      if (!updates || typeof updates !== 'object' || Object.keys(updates).length === 0) {
        return res.status(400).json({ error: 'Updates object is required' });
      }
      
      // Fields that can be updated in bulk
      const allowedUpdates = ['category', 'notes'];
      
      // Filter updates to only include allowed fields
      const filteredUpdates = {};
      allowedUpdates.forEach(field => {
        if (updates[field] !== undefined) {
          filteredUpdates[field] = updates[field];
        }
      });
      
      if (Object.keys(filteredUpdates).length === 0) {
        return res.status(400).json({ error: 'No valid update fields provided' });
      }
      
      // Verify user has access to all transactions
      const transactions = await TransactionModel.find({
        _id: { $in: transactionIds }
      });
      
      if (transactions.length === 0) {
        return res.status(404).json({ error: 'No transactions found with the provided IDs' });
      }
      
      // Get all statement IDs
      const statementIds = [...new Set(transactions.map(t => t.statementId.toString()))];
      
      // Check ownership of all statements
      const statements = await StatementModel.find({
        _id: { $in: statementIds }
      });
      
      // Verify all statements belong to the user
      const hasUnauthorizedAccess = statements.some(s => s.userId.toString() !== req.user.id);
      
      if (hasUnauthorizedAccess) {
        return res.status(403).json({ error: 'Unauthorized access to one or more transactions' });
      }
      
      // Perform the bulk update
      const result = await TransactionModel.updateMany(
        { _id: { $in: transactionIds } },
        { $set: filteredUpdates }
      );
      
      res.json({
        message: 'Transactions updated successfully',
        count: result.modifiedCount,
        updates: filteredUpdates
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  };
  
  /**
   * Get transactions with advanced filtering
   */
  getTransactions = async (req, res) => {
    try {
      const userId = req.user.id;
      const { 
        page = 1, 
        limit = 20, 
        category,
        type,
        minAmount,
        maxAmount,
        startDate,
        endDate,
        search,
        sort = 'date'
      } = req.query;
      
      // Get all statements for this user to filter transactions
      const statements = await StatementModel.find({ userId });
      
      if (statements.length === 0) {
        return res.json({
          transactions: [],
          pagination: {
            total: 0,
            page: Number(page),
            limit: Number(limit),
            pages: 0
          }
        });
      }
      
      const statementIds = statements.map(s => s._id);
      
      // Build query
      const query = { statementId: { $in: statementIds } };
      
      if (category) {
        query.category = category;
      }
      
      if (type) {
        query.type = type;
      }
      
      if (minAmount !== undefined) {
        query.amount = { ...query.amount, $gte: Number(minAmount) };
      }
      
      if (maxAmount !== undefined) {
        query.amount = { ...query.amount, $lte: Number(maxAmount) };
      }
      
      if (startDate) {
        query.date = { ...query.date, $gte: new Date(startDate) };
      }
      
      if (endDate) {
        query.date = { ...query.date, $lte: new Date(endDate) };
      }
      
      if (search) {
        query.description = { $regex: search, $options: 'i' };
      }
      
      // Determine sort order
      const sortOrder = {};
      if (sort === 'amount') {
        sortOrder.amount = -1;
      } else if (sort === 'description') {
        sortOrder.description = 1;
      } else {
        sortOrder.date = -1; // Default sort by date descending
      }
      
      // Execute query with pagination
      const transactions = await TransactionModel.find(query)
        .sort(sortOrder)
        .skip((page - 1) * limit)
        .limit(Number(limit));
      
      // Get total count for pagination
      const total = await TransactionModel.countDocuments(query);
      
      res.json({
        transactions,
        pagination: {
          total,
          page: Number(page),
          limit: Number(limit),
          pages: Math.ceil(total / limit)
        }
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  };
}

export default TransactionController;
