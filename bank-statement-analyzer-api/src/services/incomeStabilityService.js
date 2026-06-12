/**
 * @fileoverview Income Stability Service
 * Analyzes transaction patterns to determine income stability and regularity
 * @author Bank Statement Analyzer Team
 * @license MIT
 */

import logger from '../utils/logger.js';

/**
 * Income Stability Service
 * Analyzes income patterns from transactions to calculate stability scores
 */
class IncomeStabilityService {
  constructor() {
    // Keywords that indicate income transactions
    this.incomeKeywords = [
      'payroll', 'salary', 'wage', 'pay', 'deposit', 'direct dep', 'dd',
      'paycheck', 'income', 'earnings', 'compensation', 'stipend',
      'pension', 'retirement', 'social security', 'unemployment', 'benefits',
      'freelance', 'contractor', 'commission', 'bonus', 'overtime',
      'transfer from', 'ach credit', 'wire transfer', 'electronic deposit',
      'recurring deposit', 'automatic deposit', 'govt payment', 'refund'
    ];

    // Minimum amount threshold for income (to filter out small credits)
    this.minIncomeAmount = 50;

    // Maximum days between transactions to consider them regular income
    this.maxIncomeInterval = 45;
  }

  /**
   * Analyze transactions to calculate income stability
   * @param {Array} transactions - Array of transaction objects
   * @returns {Object} Analysis results with stability score and details
   */
  analyze(transactions) {
    try {
      // Input validation
      if (!Array.isArray(transactions)) {
        return this.createDefaultResult('Transactions must be an array');
      }

      if (transactions.length === 0) {
        return this.createDefaultResult('No transactions provided');
      }

      // Filter for income transactions
      const incomeTransactions = this.filterIncomeTransactions(transactions);
      
      if (incomeTransactions.length < 2) {
        return this.createDefaultResult('Insufficient income transactions for analysis');
      }

      // Sort transactions by date (oldest first)
      const sortedTransactions = incomeTransactions.sort((a, b) => 
        new Date(a.date) - new Date(b.date)
      );

      // Calculate intervals between income transactions
      const intervals = this.calculateIntervals(sortedTransactions);
      
      if (intervals.length < 2) {
        return this.createDefaultResult('Insufficient intervals for stability calculation');
      }

      // Calculate statistical measures
      const stats = this.calculateStatistics(intervals);
      
      // Calculate stability score
      const stabilityScore = this.calculateStabilityScore(stats, intervals);

      // Generate detailed analysis
      const analysis = this.generateAnalysis(sortedTransactions, intervals, stats, stabilityScore);

      logger.info('Income stability analysis completed', {
        transactionCount: transactions.length,
        incomeTransactionCount: incomeTransactions.length,
        stabilityScore,
        service: 'IncomeStabilityService'
      });

      return analysis;

    } catch (error) {
      logger.error('Error in income stability analysis:', error);
      throw error;
    }
  }

  /**
   * Filter transactions to find income-related credits
   * @param {Array} transactions - All transactions
   * @returns {Array} Filtered income transactions
   */
  filterIncomeTransactions(transactions) {
    return transactions.filter(transaction => {
      // Must be a credit transaction
      if (!transaction.amount || transaction.amount <= 0) {
        return false;
      }

      // Must meet minimum amount threshold
      if (transaction.amount < this.minIncomeAmount) {
        return false;
      }

      // Must have a valid date
      if (!transaction.date || !this.isValidDate(transaction.date)) {
        return false;
      }

      // Check for income keywords in description
      const description = (transaction.description || '').toLowerCase();
      return this.incomeKeywords.some(keyword => description.includes(keyword));
    });
  }

  /**
   * Calculate intervals in days between consecutive transactions
   * @param {Array} sortedTransactions - Transactions sorted by date
   * @returns {Array} Array of intervals in days
   */
  calculateIntervals(sortedTransactions) {
    const intervals = [];
    
    for (let i = 1; i < sortedTransactions.length; i++) {
      const prevDate = new Date(sortedTransactions[i - 1].date);
      const currentDate = new Date(sortedTransactions[i].date);
      
      const intervalDays = Math.round((currentDate - prevDate) / (1000 * 60 * 60 * 24));
      
      // Only include reasonable intervals
      if (intervalDays > 0 && intervalDays <= this.maxIncomeInterval) {
        intervals.push(intervalDays);
      }
    }
    
    return intervals;
  }

  /**
   * Calculate statistical measures for intervals
   * @param {Array} intervals - Array of interval days
   * @returns {Object} Statistical measures
   */
  calculateStatistics(intervals) {
    if (intervals.length === 0) {
      return { 
        mean: 0, 
        standardDeviation: 0, 
        median: 0, 
        variance: 0,
        min: 0,
        max: 0,
        count: 0
      };
    }

    // Calculate mean
    const mean = intervals.reduce((sum, interval) => sum + interval, 0) / intervals.length;

    // Calculate variance (sample variance for better accuracy)
    const variance = intervals.length > 1
      ? intervals.reduce((sum, interval) => {
          return sum + Math.pow(interval - mean, 2);
        }, 0) / (intervals.length - 1)
      : 0;

    // Calculate standard deviation
    const standardDeviation = Math.sqrt(variance);

    // Calculate median
    const sortedIntervals = [...intervals].sort((a, b) => a - b);
    const median = sortedIntervals.length % 2 === 0
      ? (sortedIntervals[sortedIntervals.length / 2 - 1] + sortedIntervals[sortedIntervals.length / 2]) / 2
      : sortedIntervals[Math.floor(sortedIntervals.length / 2)];

    return {
      mean: Math.round(mean * 100) / 100,
      standardDeviation: Math.round(standardDeviation * 100) / 100,
      median,
      variance: Math.round(variance * 100) / 100,
      min: Math.min(...intervals),
      max: Math.max(...intervals),
      count: intervals.length
    };
  }

  /**
   * Calculate stability score from 0-100 based on interval consistency
   * @param {Object} stats - Statistical measures
   * @param {Array} intervals - Array of intervals
   * @returns {number} Stability score (0-100)
   */
  calculateStabilityScore(stats, intervals) {
    if (stats.count === 0 || stats.mean === 0) {
      return 0;
    }

    // Calculate coefficient of variation (CV)
    const coefficientOfVariation = stats.standardDeviation / stats.mean;

    // Base score calculation
    // Lower CV = higher stability
    // CV of 0 = perfect stability (100 points)
    // CV of 1 = high variability (lower score)
    let baseScore = Math.max(0, 100 - (coefficientOfVariation * 100));

    // Bonus for reasonable income frequency
    // Ideal intervals: 7, 14, 15, 30, 31 days (weekly, bi-weekly, monthly)
    const idealIntervals = [7, 14, 15, 30, 31];
    const meanInterval = stats.mean;
    const closestIdeal = idealIntervals.reduce((prev, curr) => 
      Math.abs(curr - meanInterval) < Math.abs(prev - meanInterval) ? curr : prev
    );
    
    const intervalDeviation = Math.abs(meanInterval - closestIdeal);
    const intervalBonus = Math.max(0, 10 - intervalDeviation); // Up to 10 bonus points

    // Bonus for consistency (low standard deviation)
    const consistencyBonus = Math.max(0, 10 - stats.standardDeviation); // Up to 10 bonus points

    // Bonus for sufficient data points
    const dataBonus = Math.min(5, stats.count - 1); // Up to 5 bonus points

    // Calculate final score
    const finalScore = Math.min(100, baseScore + intervalBonus + consistencyBonus + dataBonus);

    return Math.round(finalScore);
  }

  /**
   * Generate comprehensive analysis report
   * @param {Array} incomeTransactions - Income transactions
   * @param {Array} intervals - Calculated intervals
   * @param {Object} stats - Statistical measures
   * @param {number} stabilityScore - Calculated stability score
   * @returns {Object} Complete analysis report
   */
  generateAnalysis(incomeTransactions, intervals, stats, stabilityScore) {
    const totalIncomeAmount = incomeTransactions.reduce((sum, t) => sum + t.amount, 0);
    const averageIncomeAmount = totalIncomeAmount / incomeTransactions.length;

    return {
      stabilityScore,
      stabilityRatio: stabilityScore / 100, // For Veritas Score compatibility
      incomePattern: {
        totalIncomeTransactions: incomeTransactions.length,
        totalIncomeAmount: Math.round(totalIncomeAmount * 100) / 100,
        averageIncomeAmount: Math.round(averageIncomeAmount * 100) / 100,
        dateRange: {
          earliest: incomeTransactions[0].date,
          latest: incomeTransactions[incomeTransactions.length - 1].date
        }
      },
      intervalAnalysis: {
        intervals,
        statistics: stats,
        interpretation: this.interpretStabilityScore(stabilityScore)
      },
      recommendations: this.generateRecommendations(stabilityScore, stats),
      analysisDate: new Date().toISOString()
    };
  }

  /**
   * Create default result for edge cases
   * @param {string} reason - Reason for default result
   * @returns {Object} Default analysis result
   */
  createDefaultResult(reason) {
    return {
      stabilityScore: 0,
      stabilityRatio: 0,
      incomePattern: {
        totalIncomeTransactions: 0,
        totalIncomeAmount: 0,
        averageIncomeAmount: 0,
        dateRange: null
      },
      intervalAnalysis: {
        intervals: [],
        statistics: { mean: 0, standardDeviation: 0, median: 0, variance: 0, count: 0 },
        interpretation: {
          level: 'INSUFFICIENT_DATA',
          description: reason,
          recommendation: 'Unable to calculate stability score'
        }
      },
      recommendations: ['Provide more transaction data for accurate analysis'],
      analysisDate: new Date().toISOString()
    };
  }

  /**
   * Interpret stability score
   * @param {number} score - Stability score
   * @returns {Object} Interpretation
   */
  interpretStabilityScore(score) {
    if (score >= 80) {
      return {
        level: 'VERY_STABLE',
        description: 'Highly regular income pattern with minimal variation',
        recommendation: 'Excellent income stability for loan approval'
      };
    } else if (score >= 60) {
      return {
        level: 'STABLE',
        description: 'Generally consistent income pattern with some variation',
        recommendation: 'Good income stability for most financial products'
      };
    } else if (score >= 40) {
      return {
        level: 'MODERATE',
        description: 'Moderately stable income with noticeable variation',
        recommendation: 'Income stability may require additional verification'
      };
    } else if (score >= 20) {
      return {
        level: 'UNSTABLE',
        description: 'Irregular income pattern with significant variation',
        recommendation: 'Income stability concerns - consider additional documentation'
      };
    } else {
      return {
        level: 'VERY_UNSTABLE',
        description: 'Highly irregular income pattern',
        recommendation: 'Significant income stability risks - thorough review required'
      };
    }
  }

  /**
   * Generate recommendations based on analysis
   * @param {number} stabilityScore - Calculated stability score
   * @param {Object} stats - Statistical measures
   * @returns {Array} Array of recommendations
   */
  generateRecommendations(stabilityScore, stats) {
    const recommendations = [];

    if (stabilityScore < 40) {
      recommendations.push('Consider requesting additional income documentation');
      recommendations.push('Review for alternative income sources');
    }

    if (stats.standardDeviation > 10) {
      recommendations.push('High variability in income timing detected');
    }

    if (stats.count < 3) {
      recommendations.push('Limited transaction history - consider longer analysis period');
    }

    if (stats.mean > 35) {
      recommendations.push('Income frequency appears to be monthly or less frequent');
    } else if (stats.mean < 10) {
      recommendations.push('Very frequent income deposits detected - may include non-salary income');
    }

    if (recommendations.length === 0) {
      recommendations.push('Income stability analysis shows positive results');
    }

    return recommendations;
  }

  /**
   * Validate if a date string is valid
   * @param {string} dateString - Date string to validate
   * @returns {boolean} True if valid date
   */
  isValidDate(dateString) {
    if (!dateString || typeof dateString !== 'string') {
      return false;
    }
    
    const date = new Date(dateString);
    return date instanceof Date && !isNaN(date) && dateString.length >= 8; // Minimum valid date format
  }
}

export default IncomeStabilityService;
