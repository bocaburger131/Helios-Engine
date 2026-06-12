/**
 * @license
 * Copyright (c) 2025 Shift 4 Financial INC
 * This code is licensed under the MIT License.
 * See LICENSE file for details.
 */

import TransactionCategory from '../models/TransactionCategory.js';
import llmCategorizationService from './llmCategorizationService.js';
import logger from '../utils/logger.js';

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
  },

  /**
   * Categorize a single transaction with caching
   * First checks cache, then calls LLM if needed
   * @param {Object} transaction - Transaction object with description
   * @returns {Object} Categorization result with category and confidence
   */
  async categorizeTransactionWithCache(transaction) {
    try {
      if (!transaction || !transaction.description) {
        logger.warn('Invalid transaction for categorization:', transaction);
        return {
          category: 'Other',
          confidence: 0.1,
          source: 'fallback',
          cached: false
        };
      }

      const description = transaction.description.trim();
      
      // Step 1: Check cache first
      logger.debug(`Checking cache for transaction: "${description}"`);
      const cachedCategory = await TransactionCategory.findCachedCategory(description);
      
      if (cachedCategory) {
        logger.info(`✅ Cache hit for "${description}" -> ${cachedCategory.category} (confidence: ${cachedCategory.confidence})`);
        return {
          category: cachedCategory.category,
          confidence: cachedCategory.confidence,
          source: 'cache',
          cached: true,
          useCount: cachedCategory.useCount,
          alternativeCategories: cachedCategory.alternativeCategories || []
        };
      }

      // Step 2: Cache miss - call LLM
      logger.info(`❌ Cache miss for "${description}" - calling LLM`);
      const llmResult = await llmCategorizationService.categorizeTransaction(transaction);
      
      if (!llmResult || !llmResult.category) {
        logger.warn('LLM categorization failed, using fallback');
        return {
          category: 'Other',
          confidence: 0.1,
          source: 'fallback',
          cached: false
        };
      }

      // Step 3: Save to cache
      logger.info(`💾 Saving to cache: "${description}" -> ${llmResult.category} (confidence: ${llmResult.confidence})`);
      await TransactionCategory.cacheCategory(
        description,
        llmResult.category,
        llmResult.confidence || 0.8,
        llmResult.method || 'LLM',
        llmResult.alternativeCategories || []
      );

      return {
        category: llmResult.category,
        confidence: llmResult.confidence || 0.8,
        source: 'llm',
        cached: false,
        useCount: 1,
        alternativeCategories: llmResult.alternativeCategories || []
      };

    } catch (error) {
      logger.error('Error in categorizeTransactionWithCache:', error);
      return {
        category: 'Other',
        confidence: 0.1,
        source: 'error',
        cached: false,
        error: error.message
      };
    }
  },

  /**
   * Categorize multiple transactions with caching
   * Processes transactions in batches for better performance
   * @param {Array} transactions - Array of transaction objects
   * @param {Object} options - Options for categorization
   * @returns {Array} Array of categorization results
   */
  async categorizeTransactionsWithCache(transactions, options = {}) {
    const {
      batchSize = 10,
      showProgress = false
    } = options;

    if (!Array.isArray(transactions)) {
      throw new Error('Transactions must be an array');
    }

    logger.info(`🔄 Starting categorization of ${transactions.length} transactions with caching`);
    
    const results = [];
    let cacheHits = 0;
    let llmCalls = 0;

    for (let i = 0; i < transactions.length; i += batchSize) {
      const batch = transactions.slice(i, i + batchSize);
      
      if (showProgress) {
        console.log(`Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(transactions.length / batchSize)}`);
      }

      // Process batch in parallel
      const batchPromises = batch.map(async (transaction, index) => {
        try {
          const result = await this.categorizeTransactionWithCache(transaction);
          
          if (result.cached) {
            cacheHits++;
          } else if (result.source === 'llm') {
            llmCalls++;
          }

          return {
            index: i + index,
            transaction,
            ...result
          };
        } catch (error) {
          logger.error(`Error categorizing transaction ${i + index}:`, error);
          return {
            index: i + index,
            transaction,
            category: 'Other',
            confidence: 0.1,
            source: 'error',
            cached: false,
            error: error.message
          };
        }
      });

      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);
    }

    const cacheHitRate = transactions.length > 0 ? (cacheHits / transactions.length * 100).toFixed(1) : 0;
    
    logger.info(`✅ Categorization complete: ${transactions.length} transactions processed`);
    logger.info(`📊 Cache hits: ${cacheHits} (${cacheHitRate}%), LLM calls: ${llmCalls}`);

    return results;
  },

  /**
   * Get categorization cache statistics
   * @returns {Object} Cache statistics
   */
  async getCacheStatistics() {
    try {
      const stats = await TransactionCategory.getCacheStats();
      return {
        success: true,
        data: {
          ...stats,
          cacheEfficiency: stats.totalEntries > 0 ? 
            ((stats.totalEntries - stats.recentlyUsed) / stats.totalEntries * 100).toFixed(1) + '%' 
            : '0%'
        }
      };
    } catch (error) {
      logger.error('Error getting cache statistics:', error);
      return {
        success: false,
        error: error.message
      };
    }
  },

  /**
   * Clean up old cache entries
   * @param {number} daysOld - Remove entries older than this many days
   * @param {number} minUseCount - Minimum use count to keep entries
   * @returns {Object} Cleanup result
   */
  async cleanupCategorizationCache(daysOld = 90, minUseCount = 1) {
    try {
      logger.info(`🧹 Starting cache cleanup: removing entries older than ${daysOld} days with less than ${minUseCount} uses`);
      
      const deletedCount = await TransactionCategory.cleanupCache(daysOld, minUseCount);
      
      logger.info(`✅ Cache cleanup complete: removed ${deletedCount} entries`);
      
      return {
        success: true,
        deletedCount,
        message: `Removed ${deletedCount} old cache entries`
      };
    } catch (error) {
      logger.error('Error cleaning up cache:', error);
      return {
        success: false,
        error: error.message
      };
    }
  },

  /**
   * Force refresh cache entry for a specific description
   * @param {string} description - Transaction description to refresh
   * @returns {Object} Refresh result
   */
  async refreshCacheEntry(description) {
    try {
      logger.info(`🔄 Force refreshing cache for: "${description}"`);
      
      // Create a mock transaction for LLM categorization
      const mockTransaction = { description };
      
      // Get fresh categorization from LLM
      const llmResult = await llmCategorizationService.categorizeTransaction(mockTransaction);
      
      if (!llmResult || !llmResult.category) {
        throw new Error('LLM categorization failed');
      }

      // Update cache with new result
      await TransactionCategory.cacheCategory(
        description,
        llmResult.category,
        llmResult.confidence || 0.8,
        llmResult.method || 'LLM',
        llmResult.alternativeCategories || []
      );

      logger.info(`✅ Cache refreshed: "${description}" -> ${llmResult.category}`);
      
      return {
        success: true,
        description,
        category: llmResult.category,
        confidence: llmResult.confidence,
        message: 'Cache entry refreshed successfully'
      };
    } catch (error) {
      logger.error('Error refreshing cache entry:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }
};

export default riskAnalysisService;
