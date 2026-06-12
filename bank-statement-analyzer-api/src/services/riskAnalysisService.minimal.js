// Enhanced Risk Analysis Service
import logger from '../utils/logger.js';

class RiskAnalysisService {
  constructor() {
    this.riskFactors = {
      NSF_PENALTY: 10,
      LOW_BALANCE_PENALTY: 5,
      HIGH_VARIANCE_PENALTY: 3,
      INCOME_INSTABILITY_PENALTY: 7,
      HIGH_TRANSACTION_VOLUME_PENALTY: 2
    };
  }

  /**
   * Comprehensive risk analysis for a statement with robust error handling
   * @param {Array} transactions - Array of transaction objects
   * @param {Object} statement - Statement object
   * @returns {Object} Risk analysis results
   */
  analyze(transactions = [], statement = {}) {
    try {
      // Input validation
      if (!Array.isArray(transactions)) {
        logger.warn('Transactions parameter is not an array, using empty array');
        transactions = [];
      }

      if (!statement || typeof statement !== 'object') {
        logger.warn('Statement parameter is not an object, using empty object');
        statement = {};
      }

      // Filter valid transactions
      const validTransactions = transactions.filter(t => {
        try {
          return t && 
                 typeof t === 'object' && 
                 (t.amount || t.amount === 0) && 
                 typeof t.amount === 'number' && 
                 !isNaN(t.amount) &&
                 t.description;
        } catch (filterError) {
          return false;
        }
      });

      const analysis = {
        riskScore: 5,
        riskLevel: 'MEDIUM',
        factors: [],
        details: {
          nsfAnalysis: this._analyzeNSF(validTransactions),
          balanceAnalysis: this._analyzeBalance(validTransactions, statement),
          transactionPatterns: this._analyzeTransactionPatterns(validTransactions),
          incomeStability: this._analyzeIncomeStability(validTransactions)
        },
        recommendations: [],
        timestamp: new Date(),
        transactionCount: validTransactions.length,
        originalTransactionCount: transactions.length
      };

      // Calculate comprehensive risk score with error handling
      try {
        analysis.riskScore = this._calculateRiskScore(analysis.details);
      } catch (scoreError) {
        logger.error('Error calculating risk score:', scoreError);
        analysis.riskScore = 5; // Default medium risk
      }

      try {
        analysis.riskLevel = this._determineRiskLevel(analysis.riskScore);
      } catch (levelError) {
        logger.error('Error determining risk level:', levelError);
        analysis.riskLevel = 'MEDIUM';
      }

      try {
        analysis.factors = this._identifyRiskFactors(analysis.details);
      } catch (factorsError) {
        logger.error('Error identifying risk factors:', factorsError);
        analysis.factors = [];
      }

      try {
        analysis.recommendations = this._generateRecommendations(analysis);
      } catch (recError) {
        logger.error('Error generating recommendations:', recError);
        analysis.recommendations = [];
      }

      return analysis;
    } catch (error) {
      logger.error('Risk analysis failed:', error);
      return {
        riskScore: 5,
        riskLevel: 'MEDIUM',
        error: 'Analysis failed',
        errorDetails: error.message,
        timestamp: new Date(),
        factors: [],
        recommendations: ['Manual review recommended due to analysis error']
      };
    }
  }

  /**
   * Statement-specific risk analysis with comprehensive validation
   * @param {Object} statement - Statement object
   * @returns {Object} Statement risk analysis
   */
  analyzeStatementRisk(statement) {
    try {
      // Input validation
      if (!statement) {
        throw new Error('Statement object is required');
      }

      if (typeof statement !== 'object') {
        throw new Error('Statement must be an object');
      }

      // Extract and validate statement data with defaults
      const statementId = statement._id || statement.id || 'unknown';
      const accountNumber = statement.accountNumber || 'unknown';
      const bankName = statement.bankName || 'unknown';
      const closingBalance = typeof statement.closingBalance === 'number' ? 
        statement.closingBalance : 0;
      const openingBalance = typeof statement.openingBalance === 'number' ? 
        statement.openingBalance : 0;

      const analysis = {
        statementId,
        accountNumber,
        bankName,
        riskIndicators: {
          lowBalance: closingBalance < 500,
          negativeBalance: closingBalance < 0,
          shortPeriod: this._isShortStatementPeriod(statement.statementPeriod),
          missingData: this._hasMissingData(statement),
          largeBalanceChange: Math.abs(closingBalance - openingBalance) > 10000
        },
        balanceInfo: {
          opening: openingBalance,
          closing: closingBalance,
          change: closingBalance - openingBalance
        },
        riskScore: 5,
        riskLevel: 'MEDIUM',
        timestamp: new Date()
      };

      // Calculate statement-specific risk with error handling
      let score = 5; // Base score
      
      try {
        if (analysis.riskIndicators.negativeBalance) score += 3;
        if (analysis.riskIndicators.lowBalance) score += 2;
        if (analysis.riskIndicators.shortPeriod) score += 1;
        if (analysis.riskIndicators.missingData) score += 1;
        if (analysis.riskIndicators.largeBalanceChange) score += 1;

        // Bounds checking
        analysis.riskScore = Math.min(10, Math.max(1, score));
        analysis.riskLevel = this._determineRiskLevel(analysis.riskScore);
      } catch (calculationError) {
        logger.error('Error calculating statement risk score:', calculationError);
        analysis.riskScore = 5;
        analysis.riskLevel = 'MEDIUM';
        analysis.calculationError = calculationError.message;
      }

      return analysis;
    } catch (error) {
      logger.error('Statement risk analysis failed:', error);
      return {
        error: 'Statement risk analysis failed',
        errorDetails: error.message,
        riskScore: 5,
        riskLevel: 'MEDIUM',
        timestamp: new Date(),
        riskIndicators: {
          analysisError: true
        }
      };
    }
  }

  // Private helper methods with enhanced error handling

  _analyzeNSF(transactions) {
    try {
      if (!Array.isArray(transactions)) {
        return { count: 0, totalFees: 0, riskScore: 0 };
      }

      const nsfTransactions = transactions.filter(t => {
        try {
          return t && 
                 t.description && 
                 typeof t.description === 'string' &&
                 (t.description.toLowerCase().includes('nsf') ||
                  t.description.toLowerCase().includes('overdraft') ||
                  t.description.toLowerCase().includes('insufficient'));
        } catch (error) {
          return false;
        }
      });

      const totalFees = nsfTransactions.reduce((sum, t) => {
        try {
          return sum + Math.abs(t.amount || 0);
        } catch (error) {
          return sum;
        }
      }, 0);

      let riskScore = 0;
      if (nsfTransactions.length > 5) riskScore = 10;
      else if (nsfTransactions.length > 2) riskScore = 7;
      else if (nsfTransactions.length > 0) riskScore = 4;

      return {
        count: nsfTransactions.length,
        totalFees,
        riskScore,
        avgFeeAmount: nsfTransactions.length > 0 ? totalFees / nsfTransactions.length : 0
      };
    } catch (error) {
      logger.error('Error analyzing NSF transactions:', error);
      return { count: 0, totalFees: 0, riskScore: 5, error: error.message };
    }
  }

  _analyzeBalance(transactions, statement) {
    try {
      const closingBalance = typeof statement.closingBalance === 'number' ? 
        statement.closingBalance : 0;
      const openingBalance = typeof statement.openingBalance === 'number' ? 
        statement.openingBalance : 0;

      let riskScore = 0;
      if (closingBalance < 0) riskScore = 10;
      else if (closingBalance < 100) riskScore = 8;
      else if (closingBalance < 500) riskScore = 5;
      else if (closingBalance < 1000) riskScore = 3;

      const balanceChange = closingBalance - openingBalance;
      if (balanceChange < -5000) riskScore += 2;

      return {
        opening: openingBalance,
        closing: closingBalance,
        change: balanceChange,
        riskScore: Math.min(10, riskScore),
        isNegative: closingBalance < 0,
        isLow: closingBalance < 500
      };
    } catch (error) {
      logger.error('Error analyzing balance:', error);
      return { 
        opening: 0, 
        closing: 0, 
        change: 0, 
        riskScore: 5, 
        error: error.message 
      };
    }
  }

  _analyzeTransactionPatterns(transactions) {
    try {
      if (!Array.isArray(transactions) || transactions.length === 0) {
        return { volume: 0, velocity: 0, riskScore: 0 };
      }

      const validTransactions = transactions.filter(t => 
        t && typeof t.amount === 'number' && !isNaN(t.amount)
      );

      if (validTransactions.length === 0) {
        return { volume: 0, velocity: 0, riskScore: 0 };
      }

      const totalVolume = validTransactions.reduce((sum, t) => sum + Math.abs(t.amount), 0);
      const avgAmount = totalVolume / validTransactions.length;
      
      // Calculate velocity (transactions per day)
      const dates = validTransactions
        .map(t => {
          try {
            return t.date ? new Date(t.date) : null;
          } catch (error) {
            return null;
          }
        })
        .filter(date => date && !isNaN(date.getTime()))
        .sort((a, b) => a - b);

      let velocity = 0;
      if (dates.length > 1) {
        const daysDiff = (dates[dates.length - 1] - dates[0]) / (1000 * 60 * 60 * 24);
        velocity = validTransactions.length / Math.max(daysDiff, 1);
      }

      let riskScore = 0;
      if (velocity > 10) riskScore = 8;
      else if (velocity > 5) riskScore = 5;
      else if (velocity > 2) riskScore = 3;

      if (avgAmount > 10000) riskScore += 2;

      return {
        volume: totalVolume,
        velocity,
        avgAmount,
        transactionCount: validTransactions.length,
        riskScore: Math.min(10, riskScore)
      };
    } catch (error) {
      logger.error('Error analyzing transaction patterns:', error);
      return { volume: 0, velocity: 0, riskScore: 5, error: error.message };
    }
  }

  _analyzeIncomeStability(transactions) {
    try {
      if (!Array.isArray(transactions)) {
        return { stability: 'unknown', riskScore: 5 };
      }

      const incomeTransactions = transactions.filter(t => {
        try {
          return t && 
                 typeof t.amount === 'number' && 
                 !isNaN(t.amount) &&
                 t.amount > 500 && 
                 t.description &&
                 (t.description.toLowerCase().includes('payroll') ||
                  t.description.toLowerCase().includes('salary') ||
                  t.description.toLowerCase().includes('deposit'));
        } catch (error) {
          return false;
        }
      });

      if (incomeTransactions.length === 0) {
        return { stability: 'no_income_detected', riskScore: 7 };
      }

      const amounts = incomeTransactions.map(t => t.amount);
      const avgIncome = amounts.reduce((a, b) => a + b, 0) / amounts.length;
      
      // Calculate coefficient of variation for stability
      const variance = amounts.reduce((sum, amount) => 
        sum + Math.pow(amount - avgIncome, 2), 0) / amounts.length;
      const stdDev = Math.sqrt(variance);
      const coefficientOfVariation = avgIncome > 0 ? stdDev / avgIncome : 1;

      let stability;
      let riskScore;
      
      if (coefficientOfVariation < 0.2) {
        stability = 'very_stable';
        riskScore = 1;
      } else if (coefficientOfVariation < 0.4) {
        stability = 'stable';
        riskScore = 3;
      } else if (coefficientOfVariation < 0.6) {
        stability = 'moderate';
        riskScore = 5;
      } else {
        stability = 'unstable';
        riskScore = 8;
      }

      return {
        stability,
        riskScore,
        avgIncome,
        incomeCount: incomeTransactions.length,
        variability: coefficientOfVariation
      };
    } catch (error) {
      logger.error('Error analyzing income stability:', error);
      return { stability: 'unknown', riskScore: 5, error: error.message };
    }
  }

  _isShortStatementPeriod(statementPeriod) {
    try {
      if (!statementPeriod || !statementPeriod.startDate || !statementPeriod.endDate) {
        return true; // Missing data is risky
      }

      const start = new Date(statementPeriod.startDate);
      const end = new Date(statementPeriod.endDate);
      
      if (isNaN(start.getTime()) || isNaN(end.getTime())) {
        return true; // Invalid dates
      }

      const daysDiff = (end - start) / (1000 * 60 * 60 * 24);
      return daysDiff < 25; // Less than 25 days is considered short
    } catch (error) {
      return true; // Error indicates missing or invalid data
    }
  }

  _hasMissingData(statement) {
    try {
      if (!statement || typeof statement !== 'object') {
        return true;
      }

      const requiredFields = ['accountNumber', 'bankName', 'statementPeriod'];
      return requiredFields.some(field => !statement[field]);
    } catch (error) {
      return true;
    }
  }
  _analyzeNSF(transactions) {
    const nsfTransactions = transactions.filter(t => 
      t.description && (
        t.description.toLowerCase().includes('nsf') ||
        t.description.toLowerCase().includes('insufficient') ||
        t.description.toLowerCase().includes('overdraft') ||
        t.description.toLowerCase().includes('returned item')
      )
    );

    return {
      count: nsfTransactions.length,
      totalAmount: nsfTransactions.reduce((sum, t) => sum + Math.abs(t.amount || 0), 0),
      frequency: transactions.length > 0 ? nsfTransactions.length / transactions.length : 0,
      riskLevel: nsfTransactions.length >= 3 ? 'HIGH' : nsfTransactions.length >= 1 ? 'MEDIUM' : 'LOW'
    };
  }

  _analyzeBalance(transactions, statement) {
    const openingBalance = statement.openingBalance || 0;
    let runningBalance = openingBalance;
    const balances = [openingBalance];

    transactions.forEach(t => {
      runningBalance += (t.amount || 0);
      balances.push(runningBalance);
    });

    const minBalance = Math.min(...balances);
    const maxBalance = Math.max(...balances);
    const avgBalance = balances.reduce((a, b) => a + b, 0) / balances.length;

    return {
      opening: openingBalance,
      closing: statement.closingBalance || runningBalance,
      minimum: minBalance,
      maximum: maxBalance,
      average: avgBalance,
      volatility: this._calculateVolatility(balances),
      negativeCount: balances.filter(b => b < 0).length,
      lowBalanceCount: balances.filter(b => b < 500).length
    };
  }

  _analyzeTransactionPatterns(transactions) {
    if (transactions.length === 0) {
      return {
        totalCount: 0,
        avgAmount: 0,
        pattern: 'NO_DATA'
      };
    }

    const amounts = transactions.map(t => Math.abs(t.amount || 0));
    const avgAmount = amounts.reduce((a, b) => a + b, 0) / amounts.length;
    
    return {
      totalCount: transactions.length,
      avgAmount,
      largestTransaction: Math.max(...amounts),
      smallestTransaction: Math.min(...amounts),
      variance: this._calculateVariance(amounts),
      pattern: this._identifyTransactionPattern(transactions)
    };
  }

  _analyzeIncomeStability(transactions) {
    const incomeTransactions = transactions.filter(t => (t.amount || 0) > 500);
    
    if (incomeTransactions.length < 2) {
      return {
        stability: 'INSUFFICIENT_DATA',
        regularIncome: false,
        avgIncome: 0,
        variability: 1
      };
    }

    const amounts = incomeTransactions.map(t => t.amount);
    const avgIncome = amounts.reduce((a, b) => a + b, 0) / amounts.length;
    const variance = this._calculateVariance(amounts);
    const coefficientOfVariation = Math.sqrt(variance) / avgIncome;

    return {
      stability: coefficientOfVariation < 0.2 ? 'HIGH' : coefficientOfVariation < 0.5 ? 'MEDIUM' : 'LOW',
      regularIncome: incomeTransactions.length >= 2 && coefficientOfVariation < 0.3,
      avgIncome,
      variability: coefficientOfVariation,
      incomeCount: incomeTransactions.length
    };
  }

  _calculateRiskScore(details) {
    let score = 5; // Base score

    // NSF penalties
    score += details.nsfAnalysis.count * 2;
    
    // Balance penalties
    if (details.balanceAnalysis.minimum < 0) score += 3;
    if (details.balanceAnalysis.average < 500) score += 2;
    if (details.balanceAnalysis.negativeCount > 0) score += 1;

    // Income stability
    if (details.incomeStability.stability === 'LOW') score += 2;
    if (!details.incomeStability.regularIncome) score += 1;

    // Transaction patterns
    if (details.transactionPatterns.variance > 1000000) score += 1;

    return Math.min(10, Math.max(1, score));
  }

  _determineRiskLevel(score) {
    if (score >= 8) return 'HIGH';
    if (score >= 6) return 'MEDIUM';
    return 'LOW';
  }

  _identifyRiskFactors(details) {
    const factors = [];

    if (details.nsfAnalysis.count > 0) {
      factors.push(`${details.nsfAnalysis.count} NSF/Overdraft incidents`);
    }

    if (details.balanceAnalysis.minimum < 0) {
      factors.push('Negative balance periods');
    }

    if (details.balanceAnalysis.average < 500) {
      factors.push('Low average balance');
    }

    if (details.incomeStability.stability === 'LOW') {
      factors.push('Irregular income patterns');
    }

    return factors;
  }

  _generateRecommendations(analysis) {
    const recommendations = [];

    if (analysis.details.nsfAnalysis.count > 0) {
      recommendations.push('Consider account monitoring to avoid overdraft fees');
    }

    if (analysis.details.balanceAnalysis.average < 1000) {
      recommendations.push('Maintain higher account balance to reduce risk');
    }

    if (!analysis.details.incomeStability.regularIncome) {
      recommendations.push('Work on stabilizing income sources');
    }

    if (analysis.riskScore >= 8) {
      recommendations.push('High risk account - consider additional verification');
    }

    return recommendations;
  }

  _calculateVolatility(values) {
    if (values.length < 2) return 0;
    const avg = values.reduce((a, b) => a + b, 0) / values.length;
    const variance = values.reduce((sum, val) => sum + Math.pow(val - avg, 2), 0) / values.length;
    return Math.sqrt(variance);
  }

  _calculateVariance(values) {
    if (values.length < 2) return 0;
    const avg = values.reduce((a, b) => a + b, 0) / values.length;
    return values.reduce((sum, val) => sum + Math.pow(val - avg, 2), 0) / values.length;
  }

  _identifyTransactionPattern(transactions) {
    if (transactions.length < 5) return 'LIMITED_DATA';
    
    const dailyTxCount = {};
    transactions.forEach(t => {
      const day = new Date(t.date).getDay();
      dailyTxCount[day] = (dailyTxCount[day] || 0) + 1;
    });

    const weekdayTotal = [1, 2, 3, 4, 5].reduce((sum, day) => sum + (dailyTxCount[day] || 0), 0);
    const weekendTotal = [0, 6].reduce((sum, day) => sum + (dailyTxCount[day] || 0), 0);

    if (weekdayTotal > weekendTotal * 2) return 'BUSINESS_PATTERN';
    if (weekendTotal > weekdayTotal) return 'PERSONAL_PATTERN';
    return 'MIXED_PATTERN';
  }

  _isShortStatementPeriod(period) {
    if (!period) return true;
    // Simple check - in production this would parse actual dates
    return period.includes('week') || period.length < 10;
  }

  _hasMissingData(statement) {
    return !statement.accountNumber || 
           !statement.bankName || 
           !statement.statementPeriod ||
           (statement.openingBalance === undefined && statement.closingBalance === undefined);
  }
}

// Create singleton instance
const service = new RiskAnalysisService();

export { service as default, RiskAnalysisService };
