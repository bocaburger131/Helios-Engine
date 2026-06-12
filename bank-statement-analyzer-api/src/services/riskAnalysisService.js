import logger from '../utils/logger.js';
import { LLMCategorizationService } from './llmCategorizationService.js';
import TransactionCategory from '../models/TransactionCategory.js';
import { normalizeTransactionForLedger, isLedgerInflow, isLedgerOutflow } from '../utils/transactionNormalization.js';
import { getAbsurdityThreshold } from '../utils/amountSanityGuardrails.js';

/** Totals and NSF use normalizeTransactionForLedger per row; callers may pass balance-inferred arrays (normalizeTransactionsWithBalanceInference) — second normalization is idempotent. */

/**
 * Service for analyzing risk based on bank statements and transactions
 */
class RiskAnalysisService {
  constructor() {
    this.logger = logger;
    this.llmService = new LLMCategorizationService();
  }

  /**
   * Calculates the number of NSF (Non-Sufficient Funds) fees in the transactions
   * @param {Array} transactions The list of transactions to analyze
   * @returns {number} The count of NSF fees
   */
  calculateNSFCount(transactions) {
    if (!Array.isArray(transactions)) {
      throw new Error('Transactions must be an array');
    }
    return transactions.filter(t => {
      const description = (t.description || '').toUpperCase();
      return description.includes('NSF') ||
             description.includes('INSUFFICIENT FUNDS') ||
             description.includes('INSUFFICIENT') ||
             description.includes('OVERDRAFT') ||
             description.includes('RETURNED ITEM') ||
             description.includes('RETURNED CHECK') ||
             description.includes('RETURNED DEPOSIT') ||
             description.includes('NON-SUFFICIENT');
    }).length;
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
    const maxAmount = getAbsurdityThreshold();
    return transactions.reduce((acc, raw) => {
      if (raw?.excludeFromMacroTotals) return acc;
      const transaction = normalizeTransactionForLedger(raw);
      if (transaction && typeof transaction.amount === 'number') {
        const amount = Math.abs(transaction.amount);

        if (amount > maxAmount) {
          logger.warn(`[RISK_SERVICE] Rejected suspicious transaction amount: $${amount.toLocaleString()} - likely routing/account number`);
          return acc;
        }

        if (isLedgerInflow(transaction)) {
          acc.totalDeposits += amount;
          acc.depositCount++;
        } else if (isLedgerOutflow(transaction)) {
          acc.totalWithdrawals += amount;
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
   * Calculates NSF (Non-Sufficient Funds) related metrics
   * @param {Array} transactions The list of transactions to analyze
   * @returns {Object} Object containing NSF metrics
   * @throws {Error} If transactions parameter is not an array
   */
  calculateNSFMetrics(transactions) {
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

    const nsfTransactions = transactions.filter(transaction => {
      if (transaction && transaction.description) {
        const description = transaction.description.toLowerCase();
        return nsfKeywords.some(keyword => description.includes(keyword));
      }
      return false;
    });

    return {
      nsfCount: nsfTransactions.length,
      nsfTotal: nsfTransactions.reduce((sum, t) => sum + Math.abs(t.amount), 0),
      nsfTransactions
    };
  }

  /**
   * Calculates the average daily balance for a list of transactions
   * @param {Array} transactions The list of transactions to analyze
   * @param {number} openingBalance The opening balance before these transactions
   * @returns {Object} Object containing averageDailyBalance and other balance metrics
   * @throws {Error} If transactions parameter is not an array
   */
  calculateAverageDailyBalance(transactions, openingBalance) {
    if (!Array.isArray(transactions)) {
      throw new Error('Transactions must be an array');
    }

    // Treat null / undefined / non-numbers as invalid
    if (openingBalance == null || typeof openingBalance !== 'number' || isNaN(openingBalance)) {
      throw new Error('Opening balance must be a number');
    }

    if (transactions.length === 0) {
      return {
        averageDailyBalance: openingBalance,
        lowestBalance: openingBalance,
        highestBalance: openingBalance,
        periodDays: 0
      };
    }

    const sortedTransactions = [...transactions].sort((a, b) => 
      new Date(a.date) - new Date(b.date)
    );

    // Date range calculation (standard bank month is ~30 days, using actual date spread)
    const startDate = new Date(sortedTransactions[0].date);
    startDate.setHours(0, 0, 0, 0);
    const endDate = new Date(sortedTransactions[sortedTransactions.length - 1].date);
    endDate.setHours(23, 59, 59, 999);
    
    // Most business bank statements are for a full month
    // We'll calculate the actual days between transactions but ensure it's at least 25 to avoid skewing
    let daysCovered = Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24));
    if (daysCovered < 1) daysCovered = 1;
    // Safety cap: if transactions span more than 400 days, at least one transaction
    // has a wrong-year date (e.g. 2040 instead of 2024). Clamping prevents
    // totalBalanceSum from accumulating over thousands of phantom days and producing
    // an astronomically inflated averageDailyBalance.
    if (daysCovered > 400) {
      logger.warn(`[RISK] Suspicious date range: ${daysCovered} days — possible wrong-year transactions. Clamping to 400.`);
      daysCovered = 400;
    }

    // Track running balance and extremes
    let runningBalance = openingBalance;
    let totalBalanceSum = 0;
    let lowestBalance = openingBalance;
    let highestBalance = openingBalance;
    let currentDate = new Date(startDate);

    // Group transactions by date for efficient processing
    const txByDate = sortedTransactions.reduce((acc, tx) => {
      const d = new Date(tx.date).toISOString().split('T')[0];
      if (!acc[d]) acc[d] = [];
      acc[d].push(tx);
      return acc;
    }, {});

    // Iterate through every single day in the period
    let acceptedCount = 0;
    let rejectedCount = 0;
    let rejectedTotal = 0;

    for (let i = 0; i <= daysCovered; i++) {
        const dateStr = currentDate.toISOString().split('T')[0];
        
        // Process all transactions for this day
        if (txByDate[dateStr]) {
            for (const tx of txByDate[dateStr]) {
                const absAmount = Math.abs(tx.amount);
                
                // Skip suspiciously large amounts (likely routing/account numbers or extraction errors)
                // Lowered threshold from $10M to $500K for better data quality
                if (absAmount > 500_000) {
                    logger.warn(`[ADB] Rejected large transaction: $${absAmount.toLocaleString()} - likely data extraction error`);
                    rejectedCount++;
                    rejectedTotal += absAmount;
                    continue;
                }
                
                // Also reject suspiciously round amounts over $50K (possible extracted numbers, not real transactions)
                if (absAmount >= 50_000 && absAmount % 10_000 === 0) {
                    logger.warn(`[ADB] Rejected suspiciously round amount: $${absAmount.toLocaleString()} - likely not a real transaction`);
                    rejectedCount++;
                    rejectedTotal += absAmount;
                    continue;
                }
                
                acceptedCount++;
                runningBalance += tx.amount;
                lowestBalance = Math.min(lowestBalance, runningBalance);
                highestBalance = Math.max(highestBalance, runningBalance);
            }
        }
        
        totalBalanceSum += runningBalance;
        
        // Move to next day
        currentDate.setDate(currentDate.getDate() + 1);
    }

    const actualDays = daysCovered + 1;
    const avgBalance = Math.round((totalBalanceSum / actualDays) * 100) / 100;

    // Log filtering summary for debugging
    logger.info(`[ADB] Transaction filtering summary: Total=${acceptedCount + rejectedCount}, Accepted=${acceptedCount}, Rejected=${rejectedCount}, RejectedTotal=$${rejectedTotal.toLocaleString()}, ADB=$${avgBalance.toLocaleString()}`);

    return {
      averageDailyBalance: avgBalance,
      lowestBalance: Math.round(lowestBalance * 100) / 100,
      highestBalance: Math.round(highestBalance * 100) / 100,
      periodDays: actualDays
    };
  }

  /**
   * Calculates income stability metrics
   * @param {Array} transactions The list of transactions to analyze
   * @returns {Object} Object containing income stability metrics
   */
  calculateIncomeStability(transactions) {
    // Filter credit transactions (deposits)
    const deposits = transactions
      .filter(t => t.amount > 0)
      .sort((a, b) => new Date(a.date) - new Date(b.date));

    // Group deposits by month
    const monthlyDeposits = deposits.reduce((acc, deposit) => {
      const month = new Date(deposit.date).toISOString().substring(0, 7);
      acc[month] = (acc[month] || 0) + deposit.amount;
      return acc;
    }, {});

    const monthlyAmounts = Object.values(monthlyDeposits);
    
    // Calculate metrics — guard against empty array to avoid NaN
    const averageMonthlyIncome = monthlyAmounts.length > 0
      ? monthlyAmounts.reduce((sum, amount) => sum + amount, 0) / monthlyAmounts.length
      : 0;
    const incomeVariance = monthlyAmounts.length > 1
      ? monthlyAmounts.reduce((sum, amount) => {
          const diff = amount - averageMonthlyIncome;
          return sum + (diff * diff);
        }, 0) / monthlyAmounts.length
      : 0;

    return {
      averageMonthlyIncome,
      incomeVariance,
      monthlyDeposits,
      stabilityScore: this._calculateStabilityScore(incomeVariance, averageMonthlyIncome)
    };
  }

  /**
   * Calculate business-related metrics
   * @param {Array} transactions The list of transactions to analyze
   * @returns {Object} Object containing business activity metrics
   */
  calculateBusinessMetrics(transactions) {
    const businessKeywords = ['PAYPAL', 'SQUARE', 'STRIPE', 'SHOPIFY', 'VENDOR', 'INVENTORY'];
    const businessTransactions = transactions.filter(transaction => {
      const description = transaction.description.toUpperCase();
      return businessKeywords.some(keyword => description.includes(keyword));
    });

    const businessDeposits = businessTransactions.filter(t => t.amount > 0);
    const businessExpenses = businessTransactions.filter(t => t.amount < 0);

    return {
      totalBusinessDeposits: businessDeposits.reduce((sum, t) => sum + t.amount, 0),
      totalBusinessExpenses: Math.abs(businessExpenses.reduce((sum, t) => sum + t.amount, 0)),
      businessTransactionCount: businessTransactions.length,
      hasBusinessActivity: businessTransactions.length > 0,
      businessTransactions
    };
  }

  /**
   * Calculate overall Veritas Score
   * @param {Object} data Analysis data including all metrics
   * @returns {Object} Object containing Veritas score and factor breakdown
   */
  async calculateVeritasScore(data) {
    const {
      transactions,
      nsfMetrics,
      balanceMetrics,
      incomeMetrics,
      businessMetrics
    } = data;

    // Base score starts at 700
    let score = 700;

    // NSF Impact (-50 points per NSF, max -150)
    score -= Math.min(nsfMetrics.nsfCount * 50, 150);

    // Balance Impact (max +/- 100)
    const balanceImpact = this._calculateBalanceImpact(balanceMetrics);
    score += balanceImpact;

    // Income Stability Impact (max +/- 100)
    const stabilityImpact = this._calculateStabilityImpact(incomeMetrics);
    score += stabilityImpact;

    // Transaction Volume and Pattern Impact (max +50)
    const transactionImpact = this._calculateTransactionImpact(transactions);
    score += transactionImpact;

    // Business Activity Impact (max +50)
    if (businessMetrics.hasBusinessActivity) {
      const businessImpact = this._calculateBusinessImpact(businessMetrics);
      score += businessImpact;
    }

    // Ensure score stays within bounds (300-850)
    score = Math.max(300, Math.min(850, score));

    return {
      score,
      factors: {
        nsfImpact: -Math.min(nsfMetrics.nsfCount * 50, 150),
        balanceImpact,
        stabilityImpact,
        transactionImpact,
        businessImpact: businessMetrics.hasBusinessActivity ? 
          this._calculateBusinessImpact(businessMetrics) : 0
      }
    };
  }

  /**
   * Helper method to calculate stability score
   */
  _calculateStabilityScore(variance, averageIncome) {
    if (averageIncome === 0) return 0;
    const coefficientOfVariation = Math.sqrt(variance) / averageIncome;
    return Math.max(0, 100 * (1 - coefficientOfVariation));
  }

  /**
   * Helper method to calculate balance impact on score
   */
  _calculateBalanceImpact(balanceMetrics) {
    const { averageDailyBalance, lowestBalance } = balanceMetrics;
    if (averageDailyBalance <= 0) return -100;
    if (lowestBalance < 0) return -50;
    
    const balanceScore = Math.min(100, (averageDailyBalance / 5000) * 100);
    return Math.floor(balanceScore);
  }

  /**
   * Helper method to calculate stability impact on score
   */
  _calculateStabilityImpact(incomeMetrics) {
    const { stabilityScore, averageMonthlyIncome } = incomeMetrics;
    if (averageMonthlyIncome === 0) return -100;
    return Math.floor(stabilityScore - 50);
  }

  /**
   * Helper method to calculate transaction impact on score
   */
  _calculateTransactionImpact(transactions) {
    if (transactions.length < 5) return 0;
    return Math.min(50, Math.floor(transactions.length / 2));
  }

  /**
   * Helper method to calculate business impact on score
   */
  _calculateBusinessImpact(businessMetrics) {
    const { totalBusinessDeposits, totalBusinessExpenses } = businessMetrics;
    if (totalBusinessDeposits === 0) return 0;
    
    const profitRatio = (totalBusinessDeposits - totalBusinessExpenses) / totalBusinessDeposits;
    return Math.floor(Math.min(50, profitRatio * 100));
  }

  async analyzeFinancialRisk(transactions, metadata = {}, options = {}) {
    if (!Array.isArray(transactions)) {
      throw new Error('Transactions must be an array');
    }

    const normalized = transactions.map((t) => normalizeTransactionForLedger(t));

    const context = (metadata && typeof metadata === 'object' && !Array.isArray(metadata)) ? metadata : {};
    
    // Check if we have an explicit opening balance from metadata
    let openingBalance = typeof context.openingBalance === 'number' ? context.openingBalance : 0;
    
    // VALIDATION: If transactions exist but balance is 0, sanity check with transaction flow
    const totalDeposits = normalized.reduce((sum, t) => {
      const amount = Math.abs(t.amount);
      // Skip suspiciously large amounts (routing numbers, etc.)
      if (amount > 10_000_000) return sum;
      return t.amount > 0 ? sum + t.amount : sum;
    }, 0);
    const totalWithdrawals = Math.abs(normalized.reduce((sum, t) => {
      const amount = Math.abs(t.amount);
      // Skip suspiciously large amounts (routing numbers, etc.)
      if (amount > 10_000_000) return sum;
      return t.amount < 0 ? sum + t.amount : sum;
    }, 0));
    
    // If opening balance is 0 but we have a closing balance in metadata, 
    // we can back-calculate to verify or recover the opening balance
    if (openingBalance === 0 && typeof context.closingBalance === 'number' && context.closingBalance > 0 && normalized.length > 0) {
        const calculatedOpening = context.closingBalance - totalDeposits + totalWithdrawals;
        if (calculatedOpening > 0 && calculatedOpening < 100000000) {
            openingBalance = calculatedOpening;
            logger.info('[RISK_SERVICE] Recalculated opening balance from closing and flow', { openingBalance });
        }
    }

    const nsfMetrics = this.calculateNSFMetrics(normalized);
    const balanceMetrics = this.calculateAverageDailyBalance(normalized, openingBalance);
    const incomeMetrics = this.calculateIncomeStability(normalized);
    const businessMetrics = this.calculateBusinessMetrics(normalized);
    const depositsAndWithdrawals = this.calculateTotalDepositsAndWithdrawals(normalized);
    const veritasResult = await this.calculateVeritasScore({
      transactions: normalized,
      nsfMetrics,
      balanceMetrics,
      incomeMetrics,
      businessMetrics
    });

    const riskCategory = this._determineRiskLevel(veritasResult.score);
    const riskFactors = [];

    if (nsfMetrics.nsfCount > 0) {
      riskFactors.push({
        type: 'NSF_ACTIVITY',
        severity: nsfMetrics.nsfCount >= 3 ? 'HIGH' : 'MEDIUM',
        count: nsfMetrics.nsfCount,
        impact: 'Cash flow volatility detected'
      });
    }

    if (balanceMetrics.lowestBalance < 0) {
      riskFactors.push({
        type: 'NEGATIVE_BALANCE',
        severity: 'HIGH',
        amount: balanceMetrics.lowestBalance,
        impact: 'Account dropped below zero'
      });
    }

    if ((incomeMetrics.stabilityScore || 0) < 50) {
      riskFactors.push({
        type: 'INCOME_INSTABILITY',
        severity: 'MEDIUM',
        score: incomeMetrics.stabilityScore || 0,
        impact: 'Irregular deposit pattern detected'
      });
    }

    return {
      veritasScore: {
        overall: veritasResult.score,
        score: veritasResult.score,
        rating: riskCategory,
        factors: veritasResult.factors,
        includeVeritasScore: options.includeVeritasScore === true
      },
      summary: {
        riskCategory,
        transactionCount: normalized.length,
        averageDailyBalance: balanceMetrics.averageDailyBalance,
        totalDeposits: depositsAndWithdrawals.totalDeposits,
        totalWithdrawals: depositsAndWithdrawals.totalWithdrawals
      },
      riskFactors,
      riskIndicators: {
        nsf: nsfMetrics,
        income: incomeMetrics,
        business: businessMetrics
      },
      liquidityAnalysis: {
        ...balanceMetrics,
        averageBalance: balanceMetrics.averageDailyBalance
      },
      depositsAndWithdrawals,
      metadata: {
        bankName: context.bankName || context.bankType || 'UNKNOWN',
        openingBalance
      }
    };
  }

  /**
   * Analyze overall risk and generate comprehensive report
   * @param {Array} transactions The list of transactions to analyze
   * @param {Object} statement The bank statement data
   * @returns {Object} Comprehensive risk analysis report
   */
  async analyzeRisk(transactions, statement) {
    try {
      const normalized = Array.isArray(transactions)
        ? transactions.map((t) => normalizeTransactionForLedger(t))
        : [];

      // Support legacy callers that pass openingBalance as a bare number
      const openingBalance = typeof statement === 'number'
        ? statement
        : (statement?.openingBalance ?? 0);

      // Calculate all metrics
      const nsfMetrics = this.calculateNSFMetrics(normalized);
      const balanceMetrics = this.calculateAverageDailyBalance(normalized, openingBalance);
      const incomeMetrics = this.calculateIncomeStability(normalized);
      const businessMetrics = this.calculateBusinessMetrics(normalized);
      
      // Calculate Veritas Score
      const veritasScore = await this.calculateVeritasScore({
        transactions: normalized,
        nsfMetrics,
        balanceMetrics,
        incomeMetrics,
        businessMetrics
      });

      // Categorize transactions
      const categorizedTransactions = await this._categorizeTransactions(normalized);

      const totals = this.calculateTotalDepositsAndWithdrawals(normalized);

      return {
        score: veritasScore.score,
        riskScore: veritasScore.score, // alias so tests using either property name both work
        factors: veritasScore.factors,
        totals,
        metrics: {
          nsf: nsfMetrics,
          balance: balanceMetrics,
          income: incomeMetrics,
          business: businessMetrics
        },
        categorizedTransactions,
        riskLevel: this._determineRiskLevel(veritasScore.score)
      };
    } catch (error) {
      this.logger.error('Error in analyzeRisk:', error);
      throw error;
    }
  }

  /**
   * Analyze transaction data for risk factors.
   * This is an alias for analyzeRisk to maintain compatibility.
   * @param {Array} transactions - The list of transactions to analyze.
   * @param {number} [openingBalance=0] - The opening balance.
   * @returns {Promise<Object>} A risk analysis object.
   */
  async analyzeTransactions(transactions, openingBalance = 0) {
    this.logger.info('analyzeTransactions called, delegating to analyzeRisk.');
    const context = (openingBalance && typeof openingBalance === 'object' && !Array.isArray(openingBalance))
      ? openingBalance
      : { openingBalance: typeof openingBalance === 'number' ? openingBalance : 0 };

    if (typeof context.openingBalance !== 'number' || Number.isNaN(context.openingBalance)) {
      context.openingBalance = 0;
    }

    return this.analyzeRisk(transactions, context);
  }

  /**
   * Helper method to categorize transactions using LLM service and caching
   */
  async _categorizeTransactions(transactions) {
    const categorized = [];

    for (const transaction of transactions) {
      try {
        // Check cache first
        const cached = await TransactionCategory.findCachedCategory(transaction.description);
        
        if (cached) {
          categorized.push({
            ...transaction,
            category: cached.category,
            confidence: cached.confidence,
            source: 'cache'
          });
          continue;
        }

        // Use LLM service for uncached transactions
        const { category, confidence } = await this.llmService.categorizeTransaction(transaction);
        
        // Cache the result
        await TransactionCategory.cacheCategory(
          transaction.description,
          category,
          confidence,
          'LLM'
        );

        categorized.push({
          ...transaction,
          category,
          confidence,
          source: 'llm'
        });
      } catch (error) {
        this.logger.error('Error categorizing transaction:', error);
        categorized.push({
          ...transaction,
          category: 'Uncategorized',
          confidence: 0,
          source: 'error'
        });
      }
    }

    return categorized;
  }

  /**
   * Helper method to determine risk level from score
   */
  _determineRiskLevel(score) {
    if (score >= 750) return 'VERY_LOW';
    if (score >= 650) return 'LOW';
    if (score >= 550) return 'MEDIUM';
    if (score >= 450) return 'HIGH';
    return 'HIGH';
  }

  async analyze(statementId, transactions) {
    if (!statementId || !transactions) {
      throw new Error('Statement ID and transactions are required for analysis.');
    }

    const riskScore = this.calculateRiskScore(transactions);
    const riskFactors = this.identifyRiskFactors(transactions);

    const analysisResult = {
      statementId,
      riskScore,
      riskFactors,
      analyzedAt: new Date(),
      transactionCount: transactions.length,
    };

    // Optionally, save the analysis to a separate collection or update the statement
    // For now, we return the result to be saved by the controller.
    return analysisResult;
  }

  calculateRiskScore(transactions) {
    // Implement your risk score calculation logic here
    // This is a placeholder implementation
    return Math.min(850, 300 + transactions.length * 10);
  }

  identifyRiskFactors(transactions) {
    // Implement your risk factor identification logic here
    // This is a placeholder implementation
    return transactions.map(t => ({
      description: t.description,
      amount: t.amount,
      date: t.date,
      riskIndicator: Math.abs(t.amount) > 1000 ? 'HIGH' : 'LOW'
    }));
  }
}

// Create singleton instance
const riskAnalysisService = new RiskAnalysisService();

export { riskAnalysisService as default, RiskAnalysisService };
