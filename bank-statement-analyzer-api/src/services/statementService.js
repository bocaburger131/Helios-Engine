import mongoose from 'mongoose';
import Statement from '../models/Statement.js';
import Transaction from '../models/Transaction.js';
import UsageTracker from '../models/UsageTracker.js';
import logger from '../utils/logger.js';

class StatementService {
  async processStatement(data) {
    const { userId, file, accountId, bankName, statementDate, uploadId } = data;
    
    try {
      // Ensure userId is a valid ObjectId
      const userObjectId = mongoose.Types.ObjectId.isValid(userId) 
        ? userId 
        : new mongoose.Types.ObjectId(userId);

      // Create statement record
      const statement = await Statement.create({
        userId: userObjectId,
        uploadId,
        accountId,
        bankName,
        statementDate: statementDate || new Date(),
        fileName: file.originalname,
        fileSize: file.size,
        mimeType: file.mimetype,
        fileUrl: `uploads/${uploadId}/${file.originalname}`, // Temporary URL
        status: 'processing',
        metadata: {
          originalName: file.originalname,
          size: file.size,
          mimetype: file.mimetype,
          uploadedAt: new Date()
        }
      });
      
      return statement;
    } catch (error) {
      logger.error('Error processing statement:', error);
      throw error;
    }
  }

  async getUserStatements(userId, options = {}) {
    try {
      // Ensure userId is a valid ObjectId
      const userObjectId = mongoose.Types.ObjectId.isValid(userId) 
        ? userId 
        : new mongoose.Types.ObjectId(userId);

      const query = { userId: userObjectId };
      const {
        page = 1,
        limit = 20,
        sortBy = 'createdAt',
        sortOrder = 'desc'
      } = options;
      
      const statements = await Statement.find(query)
        .sort({ [sortBy]: sortOrder === 'asc' ? 1 : -1 })
        .limit(limit * 1)
        .skip((page - 1) * limit)
        .select('-fileContent');
        
      const total = await Statement.countDocuments(query);
      
      return {
        docs: statements,
        total,
        page,
        limit,
        pages: Math.ceil(total / limit)
      };
    } catch (error) {
      logger.error('Error getting user statements:', error);
      throw error;
    }
  }

  async getStatementById(statementId, userId) {
    try {
      // Validate IDs
      if (!mongoose.Types.ObjectId.isValid(statementId)) {
        throw new Error('Invalid statement ID');
      }

      const userObjectId = mongoose.Types.ObjectId.isValid(userId) 
        ? userId 
        : new mongoose.Types.ObjectId(userId);

      const statement = await Statement.findOne({
        _id: statementId,
        userId: userObjectId
      });
      
      return statement;
    } catch (error) {
      logger.error('Error getting statement by ID:', error);
      throw error;
    }
  }

  async deleteStatement(statementId, userId) {
    try {
      // Validate IDs
      if (!mongoose.Types.ObjectId.isValid(statementId)) {
        throw new Error('Invalid statement ID');
      }

      const userObjectId = mongoose.Types.ObjectId.isValid(userId) 
        ? userId 
        : new mongoose.Types.ObjectId(userId);

      const statement = await Statement.findOne({
        _id: statementId,
        userId: userObjectId
      });
      
      if (!statement) {
        throw new Error('Statement not found');
      }
      
      // Delete related transactions
      await Transaction.deleteMany({ statementId });
      
      // Delete statement
      await statement.deleteOne();
      
      return true;
    } catch (error) {
      logger.error('Error deleting statement:', error);
      throw error;
    }
  }

  async analyzeStatement(statementId, userId) {
    try {
      const statement = await this.getStatementById(statementId, userId);
      
      if (!statement) {
        throw new Error('Statement not found');
      }
      
      // Get transactions
      const transactions = await Transaction.find({ statementId });
      
      // Calculate analytics
      const analytics = {
        totalTransactions: transactions.length,
        totalIncome: transactions
          .filter(t => t.amount > 0)
          .reduce((sum, t) => sum + t.amount, 0),
        totalExpenses: Math.abs(
          transactions
            .filter(t => t.amount < 0)
            .reduce((sum, t) => sum + t.amount, 0)
        ),
        categorySummary: this.calculateCategorySummary(transactions),
        merchantSummary: this.calculateMerchantSummary(transactions),
        monthlyTrend: this.calculateMonthlyTrend(transactions)
      };
      
      return analytics;
    } catch (error) {
      logger.error('Error analyzing statement:', error);
      throw error;
    }
  }

  calculateCategorySummary(transactions) {
    const summary = {};
    
    transactions.forEach(transaction => {
      const category = transaction.category || 'Uncategorized';
      if (!summary[category]) {
        summary[category] = {
          count: 0,
          total: 0
        };
      }
      summary[category].count++;
      summary[category].total += Math.abs(transaction.amount);
    });
    
    return summary;
  }

  calculateMerchantSummary(transactions) {
    const summary = {};
    
    transactions.forEach(transaction => {
      const merchant = transaction.merchant || 'Unknown';
      if (!summary[merchant]) {
        summary[merchant] = {
          count: 0,
          total: 0
        };
      }
      summary[merchant].count++;
      summary[merchant].total += Math.abs(transaction.amount);
    });
    
    return Object.entries(summary)
      .sort((a, b) => b[1].total - a[1].total)
      .slice(0, 10)
      .reduce((acc, [merchant, data]) => {
        acc[merchant] = data;
        return acc;
      }, {});
  }

  calculateMonthlyTrend(transactions) {
    const trend = {};
    
    transactions.forEach(transaction => {
      const month = new Date(transaction.date).toISOString().substring(0, 7);
      if (!trend[month]) {
        trend[month] = {
          income: 0,
          expenses: 0,
          net: 0
        };
      }
      
      if (transaction.amount > 0) {
        trend[month].income += transaction.amount;
      } else {
        trend[month].expenses += Math.abs(transaction.amount);
      }
      
      trend[month].net = trend[month].income - trend[month].expenses;
    });
    
    return trend;
  }

  async getStatementTransactions(statementId, userId, filters = {}) {
    try {
      // Verify statement ownership
      const statement = await this.getStatementById(statementId, userId);
      if (!statement) {
        throw new Error('Statement not found');
      }
      
      const query = { statementId };
      
      // Apply filters
      if (filters.category) {
        query.category = filters.category;
      }
      
      if (filters.startDate || filters.endDate) {
        query.date = {};
        if (filters.startDate) {
          query.date.$gte = new Date(filters.startDate);
        }
        if (filters.endDate) {
          query.date.$lte = new Date(filters.endDate);
        }
      }
      
      const transactions = await Transaction.find(query)
        .sort({ date: -1 });
        
      return transactions;
    } catch (error) {
      logger.error('Error getting statement transactions:', error);
      throw error;
    }
  }
}

export default new StatementService();
