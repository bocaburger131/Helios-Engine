import mongoose from 'mongoose';
import { TransactionModel } from '../models/transaction/Transaction.js';

export class AnalyticsService {
  /**
   * Get spending summary by category for a user in a specific period
   */
  static async getSpendingByCategory(userId, startDate, endDate) {
    return TransactionModel.aggregate([
      {
        $match: {
          userId: new mongoose.Types.ObjectId(userId),
          type: 'debit',
          date: { $gte: startDate, $lte: endDate }
        }
      },
      {
        $group: {
          _id: '$category',
          total: { $sum: '$amount' },
          count: { $sum: 1 },
          average: { $avg: '$amount' }
        }
      },
      {
        $sort: { total: -1 }
      }
    ]);
  }
  
  /**
   * Get monthly spending trends for a user
   */
  static async getMonthlySpendingTrends(userId, year) {
    const startDate = new Date(year, 0, 1);
    const endDate = new Date(year, 11, 31);
    
    return TransactionModel.aggregate([
      {
        $match: {
          userId: new mongoose.Types.ObjectId(userId),
          type: 'debit',
          date: { $gte: startDate, $lte: endDate }
        }
      },
      {
        $group: {
          _id: { month: { $month: '$date' } },
          total: { $sum: '$amount' }
        }
      },
      {
        $sort: { '_id.month': 1 }
      }
    ]);
  }
  
  /**
   * Get income vs expenses comparison for a period
   */
  static async getIncomeVsExpenses(userId, startDate, endDate) {
    const result = await TransactionModel.aggregate([
      {
        $match: {
          userId: new mongoose.Types.ObjectId(userId),
          date: { $gte: startDate, $lte: endDate }
        }
      },
      {
        $group: {
          _id: '$type',
          total: { $sum: '$amount' },
          count: { $sum: 1 }
        }
      }
    ]);
    
    const income = result.find(r => r._id === 'credit')?.total || 0;
    const expenses = result.find(r => r._id === 'debit')?.total || 0;
    
    return {
      income,
      expenses,
      netCashflow: income - expenses,
      savingsRate: income > 0 ? ((income - expenses) / income) * 100 : 0
    };
  }
  
  /**
   * Get top merchants by spending
   */
  static async getTopMerchants(userId, startDate, endDate, limit = 10) {
    return TransactionModel.aggregate([
      {
        $match: {
          userId: new mongoose.Types.ObjectId(userId),
          type: 'debit',
          date: { $gte: startDate, $lte: endDate },
          merchant: { $ne: '' }
        }
      },
      {
        $group: {
          _id: '$merchant',
          total: { $sum: '$amount' },
          count: { $sum: 1 },
          average: { $avg: '$amount' }
        }
      },
      {
        $sort: { total: -1 }
      },
      {
        $limit: limit
      }
    ]);
  }
  
  /**
   * Identify potential recurring expenses
   */
  static async identifyRecurringExpenses(userId) {
    // Get all transactions for the user
    const transactions = await TransactionModel.find({
      userId,
      type: 'debit'
    }).sort({ date: 1 });
    
    // Group by merchant and similar amounts
    const merchantGroups = {};
    
    transactions.forEach(tx => {
      const key = tx.merchant || tx.description.substring(0, 15);
      
      if (!merchantGroups[key]) {
        merchantGroups[key] = [];
      }
      
      merchantGroups[key].push({
        id: tx._id,
        date: tx.date,
        amount: tx.amount
      });
    });
    
    // Find potential recurring transactions (3+ transactions with similar amounts)
    const potentialRecurring = [];
    
    for (const [merchant, txs] of Object.entries(merchantGroups)) {
      if (txs.length >= 3) {
        // Group by similar amounts
        const amountGroups = {};
        
        txs.forEach(tx => {
          // Round to nearest dollar to account for small variations
          const roundedAmount = Math.round(tx.amount);
          
          if (!amountGroups[roundedAmount]) {
            amountGroups[roundedAmount] = [];
          }
          
          amountGroups[roundedAmount].push(tx);
        });
        
        // Check each amount group
        for (const [amount, amountTxs] of Object.entries(amountGroups)) {
          if (amountTxs.length >= 3) {
            // Sort by date
            amountTxs.sort((a, b) => a.date - b.date);
            
            // Check for regular intervals
            const intervals = [];
            for (let i = 1; i < amountTxs.length; i++) {
              const daysDiff = Math.round((amountTxs[i].date - amountTxs[i-1].date) / (1000 * 60 * 60 * 24));
              intervals.push(daysDiff);
            }
            
            // Check if intervals are similar
            const avgInterval = intervals.reduce((sum, i) => sum + i, 0) / intervals.length;
            const maxVariation = 5; // Allow 5 days variation
            
            const isRegular = intervals.every(interval => 
              Math.abs(interval - avgInterval) <= maxVariation
            );
            
            if (isRegular) {
              potentialRecurring.push({
                merchant,
                amount: Number(amount),
                frequency: Math.round(avgInterval),
                transactions: amountTxs
              });
            }
          }
        }
      }
    }
    
    return potentialRecurring;
  }
}