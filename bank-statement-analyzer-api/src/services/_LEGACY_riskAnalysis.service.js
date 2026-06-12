import logger from '../utils/logger.js';
import { LLMCategorizationService } from './llmCategorizationService.js';
import TransactionCategory from '../models/TransactionCategory.js';

/**
 * Service for analyzing risk based on bank statements and transactions
 */
class RiskAnalysisService {
  constructor() {
    this.logger = logger;
    this.llmService = new LLMCategorizationService();
  }

  /**
   * Calculates total deposits and withdrawals from a list of transactions
   * @param {Array} transactions The list of transactions to analyze
   * @returns {Object} Object containing totalDeposits, totalWithdrawals and counts
   * @throws {Error} If transactions parameter is not an array
   */
  calculateTotalDepositsAndWithdrawals(transactions) {
    if (!Array.isArray(transactions)) {
      throw new Error('Transactions must be an array');
    }
    return transactions.reduce((acc, transaction) => {
      if (transaction && typeof transaction.amount === 'number') {
        if (transaction.amount > 0) {
          acc.totalDeposits += transaction.amount;
          acc.depositCount++;
        } else {
          acc.totalWithdrawals += Math.abs(transaction.amount);
          acc.withdrawalCount++;
        }
      }
      return acc;
    }, {
      totalDeposits: 0,
      totalWithdrawals: 0,
      depositCount: 0,
      withdrawalCount: 0
    });
  }

  /**
   * Calculates NSF count from transactions
   * @param {Array} transactions List of transactions
   * @returns {number} Count of NSF transactions
   */
  calculateNSFCount(transactions) {
    if (!Array.isArray(transactions)) {
      throw new Error('Transactions must be an array');
    }

    return transactions.filter(tx => 
      tx.type === 'NSF' || 
      tx.description?.toLowerCase().includes('nsf') ||
      tx.description?.toLowerCase().includes('insufficient funds') ||
      tx.description?.toLowerCase().includes('returned item')
    ).length;
  }

  /**
   * Calculates average daily balance metrics
   * @param {Array} transactions List of transactions
   * @param {number} openingBalance Opening balance amount
   * @returns {Object} Balance metrics
   */
  calculateAverageDailyBalance(transactions, openingBalance) {
    if (!Array.isArray(transactions)) {
      throw new Error('Transactions must be an array');
    }

    if (typeof openingBalance !== 'number') {
      throw new Error('Opening balance must be a number');
    }

    if (transactions.length === 0) {
      return {
        averageDailyBalance: openingBalance,
        lowestBalance: openingBalance,
        highestBalance: openingBalance,
        currentBalance: openingBalance,
        periodDays: 0,
        daysCovered: 0
      };
    }

    let runningBalance = openingBalance;
    let totalDailyBalances = runningBalance;
    let daysCovered = 1;
    let lowestBalance = runningBalance;
    let highestBalance = runningBalance;

    // Sort transactions by date
    const sortedTransactions = [...transactions].sort((a, b) => 
      new Date(a.date) - new Date(b.date)
    );

    let currentDate = sortedTransactions[0]?.date;
    let periodDays = 1;

    sortedTransactions.forEach(transaction => {
      const txDate = new Date(transaction.date);
      if (currentDate && txDate > currentDate) {
        const daysDiff = Math.ceil((txDate - currentDate) / (1000 * 60 * 60 * 24));
        totalDailyBalances += (runningBalance * daysDiff);
        daysCovered += daysDiff;
        periodDays += daysDiff;
        currentDate = txDate;
      }

      runningBalance += transaction.amount;
      lowestBalance = Math.min(lowestBalance, runningBalance);
      highestBalance = Math.max(highestBalance, runningBalance);
    });

    return {
      averageDailyBalance: totalDailyBalances / daysCovered,
      lowestBalance,
      highestBalance,
      currentBalance: runningBalance,
      periodDays,
      daysCovered
    };
  }

  /**
   * Analyzes risk based on transactions and returns a risk assessment
   * @param {Array} transactions The list of transactions to analyze
   * @param {number} openingBalance Opening balance of the statement
   * @returns {Object} Risk analysis results
   */
  analyzeRisk(transactions, openingBalance) {
    if (!Array.isArray(transactions)) {
      throw new Error('Transactions must be an array');
    }

    if (typeof openingBalance !== 'number') {
      openingBalance = 0;
    }

    const totals = this.calculateTotalDepositsAndWithdrawals(transactions);
    const nsfCount = this.calculateNSFCount(transactions);
    const balanceMetrics = this.calculateAverageDailyBalance(transactions, openingBalance);

    // Calculate basic risk score (0-100)
    let riskScore = 50; // Start at neutral
    
    // Factors that increase risk
    if (nsfCount > 0) riskScore += (nsfCount * 10);
    if (balanceMetrics.lowestBalance < 0) riskScore += 15;
    if (totals.totalWithdrawals > totals.totalDeposits) riskScore += 10;

    // Factors that decrease risk
    if (balanceMetrics.averageDailyBalance > 1000) riskScore -= 10;
    if (totals.totalDeposits > totals.totalWithdrawals * 1.5) riskScore -= 10;
    if (balanceMetrics.lowestBalance > 1000) riskScore -= 5;

    // Ensure score stays within bounds
    riskScore = Math.max(0, Math.min(100, riskScore));

    // Determine risk level
    let riskLevel = 'MEDIUM';
    if (riskScore < 30) riskLevel = 'LOW';
    if (riskScore > 70) riskLevel = 'HIGH';

    return {
      riskScore,
      riskLevel,
      factors: {
        nsfCount,
        lowestBalance: balanceMetrics.lowestBalance,
        averageBalance: balanceMetrics.averageDailyBalance,
        depositToWithdrawalRatio: totals.totalDeposits / totals.totalWithdrawals
      },
      totals,
      balanceMetrics
    };
  }
}

// Export the class and a singleton instance
export { RiskAnalysisService };
const service = new RiskAnalysisService();
export default service;
