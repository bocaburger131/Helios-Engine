/**
 * @license
 * Copyright (c) 2025 Shift 4 Financial INC
 * This code is licensed under the MIT License.
 * See LICENSE file for details.
 */

const riskAnalysisService = {
  /**
   * Calculate total deposits and withdrawals from transactions
   * @param {Array} transactions - Array of transaction objects with amount property
   * @returns {Object} Object containing totalDeposits and totalWithdrawals
   */
  calculateTotalDepositsAndWithdrawals(transactions) {
    if (!Array.isArray(transactions)) {
      throw new Error('Transactions must be an array');
    }

    let totalDeposits = 0;
    let totalWithdrawals = 0;

    transactions.forEach(transaction => {
      if (transaction && typeof transaction.amount === 'number') {
        if (transaction.amount > 0) {
          totalDeposits += transaction.amount;
        } else {
          totalWithdrawals += Math.abs(transaction.amount);
        }
      }
    });

    return {
      totalDeposits: Math.round(totalDeposits * 100) / 100,
      totalWithdrawals: Math.round(totalWithdrawals * 100) / 100
    };
  },

  /**
   * Calculate NSF (Non-Sufficient Funds) count based on transaction descriptions
   * @param {Array} transactions - Array of transaction objects with description property
   * @returns {number} Count of NSF transactions
   */
  calculateNSFCount(transactions) {
    if (!Array.isArray(transactions)) {
      throw new Error('Transactions must be an array');
    }

    const nsfKeywords = [
      'nsf', 'insufficient funds', 'overdraft', 'returned check',
      'returned item', 'bounce', 'non-sufficient', 'overdraw',
      'insufficient', 'returned deposit', 'reject', 'decline',
      'unavailable funds', 'return fee', 'chargeback', 'reversal',
      'dishonored', 'unpaid', 'refer to maker'
    ];

    let nsfCount = 0;
    transactions.forEach(transaction => {
      if (transaction && transaction.description) {
        const description = transaction.description.toLowerCase();
        const isNSF = nsfKeywords.some(keyword => description.includes(keyword));
        if (isNSF) {
          nsfCount++;
        }
      }
    });

    return nsfCount;
  },

  /**
   * Calculate average daily balance over a period
   * @param {Array} transactions - Array of transaction objects with date and amount
   * @param {number} openingBalance - Starting balance (defaults to 0)
   * @returns {Object} Object containing averageDailyBalance and periodDays
   */
  calculateAverageDailyBalance(transactions, openingBalance = 0) {
    // Input validation for openingBalance when explicitly passed
    if (arguments.length > 1 && (typeof openingBalance !== 'number' || isNaN(openingBalance))) {
      throw new Error('Opening balance must be a number');
    }

    if (!Array.isArray(transactions)) {
      throw new Error('Transactions must be an array');
    }

    if (transactions.length === 0) {
      return {
        averageDailyBalance: openingBalance,
        periodDays: 0
      };
    }

    // Sort transactions by date
    const sortedTransactions = [...transactions].sort((a, b) => new Date(a.date) - new Date(b.date));

    // Group transactions by date
    const dailyTransactions = {};
    sortedTransactions.forEach(transaction => {
      const date = transaction.date;
      if (!dailyTransactions[date]) {
        dailyTransactions[date] = [];
      }
      dailyTransactions[date].push(transaction);
    });

    // Calculate daily balances
    const dates = Object.keys(dailyTransactions).sort();
    const startDate = new Date(dates[0]);
    const endDate = new Date(dates[dates.length - 1]);
    
    let currentBalance = openingBalance;
    let totalBalanceSum = 0;
    let dayCount = 0;

    // Calculate for each day in the period
    const currentDate = new Date(startDate);
    while (currentDate <= endDate) {
      const dateStr = currentDate.toISOString().split('T')[0];
      
      // Process transactions for this day
      if (dailyTransactions[dateStr]) {
        dailyTransactions[dateStr].forEach(transaction => {
          if (transaction && typeof transaction.amount === 'number') {
            currentBalance += transaction.amount;
          }
        });
      }
      
      totalBalanceSum += currentBalance;
      dayCount++;
      
      currentDate.setDate(currentDate.getDate() + 1);
    }

    const averageDailyBalance = dayCount > 0 ? Math.round((totalBalanceSum / dayCount) * 100) / 100 : openingBalance;

    return {
      averageDailyBalance,
      periodDays: dayCount
    };
  },

  /**
   * Analyze overall risk based on transactions and opening balance
   * @param {Array} transactions - Array of transaction objects
   * @param {number} openingBalance - Starting balance
   * @returns {Object} Risk analysis results
   */
  analyzeRisk(transactions, openingBalance = 0) {
    if (!Array.isArray(transactions)) {
      throw new Error('Transactions must be an array');
    }

    // Calculate NSF count (returns number directly)
    const nsfCount = this.calculateNSFCount(transactions);
    
    // Calculate deposits and withdrawals
    const totals = this.calculateTotalDepositsAndWithdrawals(transactions);
    
    // Calculate average daily balance
    const balanceAnalysis = this.calculateAverageDailyBalance(transactions, openingBalance);
    
    // Calculate withdrawal ratio
    const withdrawalRatio = totals.totalDeposits > 0 ? 
      totals.totalWithdrawals / totals.totalDeposits : 1;

    // Calculate risk score
    let riskScore = 0;

    // NSF penalty (30 points per NSF)
    riskScore += nsfCount * 30;

    // Low balance penalty
    if (balanceAnalysis.averageDailyBalance < 1000) {
      riskScore += 20;
    }

    // High withdrawal ratio penalty
    if (withdrawalRatio > 0.8) {
      riskScore += 25;
    }

    // Negative balance penalty
    if (balanceAnalysis.averageDailyBalance < 0) {
      riskScore += 40;
    }

    // Cap at 100
    riskScore = Math.min(riskScore, 100);

    // Determine risk level
    let riskLevel;
    if (riskScore >= 80) {
      riskLevel = 'HIGH';
    } else if (riskScore >= 40) {
      riskLevel = 'MEDIUM';
    } else if (riskScore >= 20) {
      riskLevel = 'LOW';
    } else {
      riskLevel = 'VERY_LOW';
    }

    return {
      riskScore,
      riskLevel,
      nsfCount,
      averageDailyBalance: balanceAnalysis.averageDailyBalance,
      withdrawalRatio: Math.round(withdrawalRatio * 100) / 100,
      totalDeposits: totals.totalDeposits,
      totalWithdrawals: totals.totalWithdrawals
    };
  }
};

export default riskAnalysisService;
