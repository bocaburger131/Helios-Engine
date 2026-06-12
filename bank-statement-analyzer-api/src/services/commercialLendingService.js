/**
 * Commercial Lending Service
 * Provides calculations and analysis for commercial lending metrics
 */
const logger = require('../config/logger');
const { ValidationError } = require('../utils/errors');
const financialCalculations = require('../utils/financialCalculations');

class CommercialLendingService {
  /**
   * Calculate Debt Service Coverage Ratio (DSCR)
   * @param {Object} analysis - The analysis object containing financial data
   * @returns {Object} - DSCR calculation results
   */
  calculateDSCR(analysis) {
    try {
      logger.info(`Calculating DSCR for analysis ${analysis._id}`);
      
      if (!analysis || !analysis.transactions || analysis.transactions.length === 0) {
        throw new ValidationError('Valid analysis with transactions is required');
      }
      
      // Extract financial data
      const transactions = analysis.transactions || [];
      const period = this._determinePeriod(analysis.startDate, analysis.endDate);
      
      // Calculate total income (deposits)
      const totalIncome = transactions
        .filter(t => t.amount > 0)
        .reduce((sum, t) => sum + t.amount, 0);
      
      // Identify debt service payments
      const debtServicePayments = transactions
        .filter(t => this._isDebtServicePayment(t))
        .reduce((sum, t) => sum + Math.abs(t.amount), 0);
      
      // Avoid division by zero
      if (debtServicePayments === 0) {
        return {
          dscr: null,
          income: totalIncome,
          debtService: 0,
          period,
          interpretation: 'No debt service payments identified in the period'
        };
      }
      
      // Calculate DSCR
      const dscr = totalIncome / debtServicePayments;
      
      // Interpret the DSCR value
      let interpretation;
      if (dscr >= 1.5) {
        interpretation = 'Strong debt service capacity';
      } else if (dscr >= 1.25) {
        interpretation = 'Good debt service capacity';
      } else if (dscr >= 1.0) {
        interpretation = 'Adequate debt service capacity';
      } else {
        interpretation = 'Insufficient debt service capacity';
      }
      
      return {
        dscr: parseFloat(dscr.toFixed(2)),
        income: totalIncome,
        debtService: debtServicePayments,
        period,
        interpretation
      };
    } catch (error) {
      logger.error(`Error calculating DSCR: ${error.message}`, { error });
      throw error;
    }
  }
  
  /**
   * Calculate Operating Cash Flow Ratio
   * @param {Object} analysis - The analysis object containing financial data
   * @returns {Object} - Operating cash flow ratio calculation results
   */
  calculateOperatingCashFlowRatio(analysis) {
    try {
      logger.info(`Calculating Operating Cash Flow Ratio for analysis ${analysis._id}`);
      
      if (!analysis || !analysis.transactions || analysis.transactions.length === 0) {
        throw new ValidationError('Valid analysis with transactions is required');
      }
      
      // Extract operating cash flow and current liabilities
      const transactions = analysis.transactions || [];
      const period = this._determinePeriod(analysis.startDate, analysis.endDate);
      
      // Calculate operating cash flow (simplified for bank statement analysis)
      const operatingCashFlow = transactions
        .filter(t => !this._isCapitalExpenditure(t) && !this._isFinancingActivity(t))
        .reduce((sum, t) => sum + t.amount, 0);
      
      // Estimate current liabilities from outflows related to regular obligations
      const currentLiabilities = transactions
        .filter(t => this._isCurrentLiability(t))
        .reduce((sum, t) => sum + Math.abs(t.amount), 0);
      
      // Avoid division by zero
      if (currentLiabilities === 0) {
        return {
          ocfRatio: null,
          operatingCashFlow,
          currentLiabilities: 0,
          period,
          interpretation: 'No current liabilities identified in the period'
        };
      }
      
      // Calculate Operating Cash Flow Ratio
      const ocfRatio = operatingCashFlow / currentLiabilities;
      
      // Interpret the ratio
      let interpretation;
      if (ocfRatio >= 1.0) {
        interpretation = 'Strong ability to cover current liabilities with operating cash flow';
      } else if (ocfRatio >= 0.75) {
        interpretation = 'Good ability to cover current liabilities with operating cash flow';
      } else if (ocfRatio >= 0.5) {
        interpretation = 'Moderate ability to cover current liabilities with operating cash flow';
      } else {
        interpretation = 'Weak ability to cover current liabilities with operating cash flow';
      }
      
      return {
        ocfRatio: parseFloat(ocfRatio.toFixed(2)),
        operatingCashFlow,
        currentLiabilities,
        period,
        interpretation
      };
    } catch (error) {
      logger.error(`Error calculating Operating Cash Flow Ratio: ${error.message}`, { error });
      throw error;
    }
  }
  
  /**
   * Calculate Current Ratio (estimation based on bank statement analysis)
   * @param {Object} analysis - The analysis object containing financial data
   * @returns {Object} - Current ratio estimation results
   */
  estimateCurrentRatio(analysis) {
    try {
      logger.info(`Estimating Current Ratio for analysis ${analysis._id}`);
      
      if (!analysis || !analysis.transactions || analysis.transactions.length === 0) {
        throw new ValidationError('Valid analysis with transactions is required');
      }
      
      // Since balance sheet data is not directly available from bank statements,
      // we will estimate current assets and liabilities from the transactions
      
      // Estimate current assets from the ending balance and liquid assets
      const endingBalance = analysis.endingBalance || analysis.startingBalance || 0;
      const period = this._determinePeriod(analysis.startDate, analysis.endDate);
      
      // Estimate current liabilities from outflows related to regular obligations
      const transactions = analysis.transactions || [];
      const monthlyLiabilities = transactions
        .filter(t => this._isCurrentLiability(t))
        .reduce((sum, t) => sum + Math.abs(t.amount), 0);
      
      // Scale liabilities to a standard amount based on period
      const currentLiabilities = this._normalizeToMonthly(monthlyLiabilities, period);
      
      // Avoid division by zero
      if (currentLiabilities === 0) {
        return {
          currentRatio: null,
          currentAssets: endingBalance,
          currentLiabilities: 0,
          period,
          interpretation: 'No current liabilities identified in the period'
        };
      }
      
      // Calculate Current Ratio
      const currentRatio = endingBalance / currentLiabilities;
      
      // Interpret the ratio
      let interpretation;
      if (currentRatio >= 2.0) {
        interpretation = 'Strong liquidity position';
      } else if (currentRatio >= 1.5) {
        interpretation = 'Good liquidity position';
      } else if (currentRatio >= 1.0) {
        interpretation = 'Adequate liquidity position';
      } else {
        interpretation = 'Potential liquidity issues';
      }
      
      return {
        currentRatio: parseFloat(currentRatio.toFixed(2)),
        currentAssets: endingBalance,
        currentLiabilities,
        period,
        interpretation
      };
    } catch (error) {
      logger.error(`Error estimating Current Ratio: ${error.message}`, { error });
      throw error;
    }
  }
  
  /**
   * Calculate business cash flow analysis
   * @param {Object} analysis - The analysis object containing financial data
   * @returns {Object} - Comprehensive cash flow analysis
   */
  analyzeBusinessCashFlow(analysis) {
    try {
      logger.info(`Analyzing business cash flow for analysis ${analysis._id}`);
      
      if (!analysis || !analysis.transactions || analysis.transactions.length === 0) {
        throw new ValidationError('Valid analysis with transactions is required');
      }
      
      const transactions = analysis.transactions || [];
      const period = this._determinePeriod(analysis.startDate, analysis.endDate);
      
      // Categorize cash flows by business activity
      const operatingActivities = transactions
        .filter(t => !this._isCapitalExpenditure(t) && !this._isFinancingActivity(t));
      
      const investingActivities = transactions
        .filter(t => this._isCapitalExpenditure(t));
      
      const financingActivities = transactions
        .filter(t => this._isFinancingActivity(t));
      
      // Calculate cash flow metrics
      const operatingCashFlow = operatingActivities.reduce((sum, t) => sum + t.amount, 0);
      const investingCashFlow = investingActivities.reduce((sum, t) => sum + t.amount, 0);
      const financingCashFlow = financingActivities.reduce((sum, t) => sum + t.amount, 0);
      const netCashFlow = operatingCashFlow + investingCashFlow + financingCashFlow;
      
      // Calculate free cash flow (Operating Cash Flow - Capital Expenditures)
      const capitalExpenditures = investingActivities
        .filter(t => t.amount < 0)
        .reduce((sum, t) => sum + Math.abs(t.amount), 0);
      
      const freeCashFlow = operatingCashFlow - capitalExpenditures;
      
      // Calculate cash flow stability metrics
      const dailyCashFlows = this._calculateDailyCashFlows(transactions);
      const cashFlowVolatility = this._calculateStandardDeviation(Object.values(dailyCashFlows));
      
      // Assess cash flow trend
      const trend = this._assessCashFlowTrend(transactions);
      
      return {
        summary: {
          operatingCashFlow,
          investingCashFlow,
          financingCashFlow,
          netCashFlow,
          freeCashFlow,
          period
        },
        metrics: {
          cashFlowToDebtRatio: this._calculateCashFlowToDebtRatio(operatingCashFlow, transactions),
          cashFlowVolatility,
          cashBurnRate: operatingCashFlow < 0 ? Math.abs(operatingCashFlow) / period.monthsInPeriod : 0,
          cashFlowToRevenue: this._calculateCashFlowToRevenueRatio(operatingCashFlow, transactions)
        },
        analysis: {
          operatingCashFlowStrength: this._assessOperatingCashFlow(operatingCashFlow, transactions),
          trend,
          seasonality: this._detectSeasonality(dailyCashFlows),
          sustainabilityRating: this._calculateSustainabilityRating(
            operatingCashFlow, 
            financingCashFlow, 
            freeCashFlow,
            cashFlowVolatility
          )
        }
      };
    } catch (error) {
      logger.error(`Error analyzing business cash flow: ${error.message}`, { error });
      throw error;
    }
  }
  
  /**
   * Generate comprehensive commercial lending profile
   * @param {Object} analysis - The analysis object containing financial data
   * @returns {Object} - Commercial lending profile with metrics and risk assessment
   */
  generateCommercialLendingProfile(analysis) {
    try {
      logger.info(`Generating commercial lending profile for analysis ${analysis._id}`);
      
      // Calculate key metrics
      const dscrResult = this.calculateDSCR(analysis);
      const ocfResult = this.calculateOperatingCashFlowRatio(analysis);
      const currentRatioResult = this.estimateCurrentRatio(analysis);
      const cashFlowAnalysis = this.analyzeBusinessCashFlow(analysis);
      
      // Placeholder implementations for methods not yet fully implemented
      const revenueStability = 0.75; // Placeholder
      const expensePredictability = 0.65; // Placeholder
      const collateralQuality = 0.5; // Placeholder
      
      // Placeholder credit risk score calculation
      const creditRiskScore = 70; // Placeholder
      
      return {
        profileDate: new Date().toISOString(),
        analysisId: analysis._id,
        period: this._determinePeriod(analysis.startDate, analysis.endDate),
        metrics: {
          debtServiceCoverageRatio: dscrResult,
          operatingCashFlowRatio: ocfResult,
          currentRatio: currentRatioResult,
          cashFlow: cashFlowAnalysis,
          revenueStability,
          expensePredictability
        },
        riskAssessment: {
          creditRiskScore,
          riskCategory: 'Medium', // Placeholder
          strengths: ['Strong operating cash flow', 'Adequate debt service coverage'], // Placeholder
          weaknesses: ['Moderate volatility in revenue'], // Placeholder
          recommendations: ['Consider debt consolidation', 'Monitor expense patterns'] // Placeholder
        }
      };
    } catch (error) {
      logger.error(`Error generating commercial lending profile: ${error.message}`, { error });
      throw error;
    }
  }
  
  /**
   * Helper method to determine if a transaction is likely a debt service payment
   * @private
   * @param {Object} transaction - The transaction to evaluate
   * @returns {boolean} - Whether the transaction is likely a debt service payment
   */
  _isDebtServicePayment(transaction) {
    if (transaction.amount >= 0) return false;
    
    const description = (transaction.description || '').toLowerCase();
    const debtKeywords = [
      'loan', 'mortgage', 'lease', 'interest', 'principal', 'debt', 'credit',
      'financing', 'payment', 'installment', 'note', 'capital', 'amort'
    ];
    
    return debtKeywords.some(keyword => description.includes(keyword));
  }
  
  /**
   * Helper method to determine if a transaction is likely a capital expenditure
   * @private
   * @param {Object} transaction - The transaction to evaluate
   * @returns {boolean} - Whether the transaction is likely a capital expenditure
   */
  _isCapitalExpenditure(transaction) {
    if (transaction.amount >= 0) return false;
    
    const description = (transaction.description || '').toLowerCase();
    const capexKeywords = [
      'equipment', 'machinery', 'vehicle', 'property', 'capital', 'asset',
      'purchase', 'acquisition', 'computer', 'software', 'furniture'
    ];
    
    return capexKeywords.some(keyword => description.includes(keyword)) && 
           Math.abs(transaction.amount) > 1000; // Assumes larger purchases are capital expenditures
  }
  
  /**
   * Helper method to determine if a transaction is likely a financing activity
   * @private
   * @param {Object} transaction - The transaction to evaluate
   * @returns {boolean} - Whether the transaction is likely a financing activity
   */
  _isFinancingActivity(transaction) {
    const description = (transaction.description || '').toLowerCase();
    const financingKeywords = [
      'loan proc', 'capital contribution', 'equity', 'investor',
      'dividend', 'distribution', 'owner draw', 'share', 'stock'
    ];
    
    return financingKeywords.some(keyword => description.includes(keyword));
  }
  
  /**
   * Helper method to determine if a transaction is likely a current liability
   * @private
   * @param {Object} transaction - The transaction to evaluate
   * @returns {boolean} - Whether the transaction is likely a current liability
   */
  _isCurrentLiability(transaction) {
    if (transaction.amount >= 0) return false;
    
    const description = (transaction.description || '').toLowerCase();
    const liabilityKeywords = [
      'rent', 'lease', 'utility', 'electric', 'gas', 'water', 'phone',
      'internet', 'insurance', 'tax', 'payroll', 'salary', 'wage',
      'supplier', 'vendor', 'inventory', 'material', 'subscription'
    ];
    
    return liabilityKeywords.some(keyword => description.includes(keyword));
  }
  
  /**
   * Helper method to determine the period covered by the analysis
   * @private
   * @param {string} startDate - The start date of the analysis
   * @param {string} endDate - The end date of the analysis
   * @returns {Object} - Period information
   */
  _determinePeriod(startDate, endDate) {
    const start = new Date(startDate);
    const end = new Date(endDate);
    const diffTime = Math.abs(end - start);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    // Calculate months in period
    const monthsInPeriod = diffDays / 30.44; // Average days in a month
    
    return {
      startDate,
      endDate,
      daysInPeriod: diffDays,
      monthsInPeriod: parseFloat(monthsInPeriod.toFixed(2))
    };
  }
  
  /**
   * Helper method to normalize a value to a monthly amount
   * @private
   * @param {number} value - The value to normalize
   * @param {Object} period - The period information
   * @returns {number} - The normalized monthly value
   */
  _normalizeToMonthly(value, period) {
    if (period.monthsInPeriod === 0) return value;
    return value / period.monthsInPeriod;
  }
  
  /**
   * Helper method to calculate daily cash flows
   * @private
   * @param {Array} transactions - The transactions to analyze
   * @returns {Object} - Daily cash flows
   */
  _calculateDailyCashFlows(transactions) {
    const dailyCashFlows = {};
    
    transactions.forEach(transaction => {
      const date = transaction.date.split('T')[0]; // Extract date portion
      if (!dailyCashFlows[date]) {
        dailyCashFlows[date] = 0;
      }
      dailyCashFlows[date] += transaction.amount;
    });
    
    return dailyCashFlows;
  }
  
  /**
   * Helper method to calculate standard deviation
   * @private
   * @param {Array} values - The values to calculate standard deviation for
   * @returns {number} - The standard deviation
   */
  _calculateStandardDeviation(values) {
    const n = values.length;
    if (n === 0) return 0;
    
    const mean = values.reduce((sum, value) => sum + value, 0) / n;
    const variance = values.reduce((sum, value) => sum + Math.pow(value - mean, 2), 0) / n;
    
    return Math.sqrt(variance);
  }
  
  /**
   * Helper method to assess cash flow trend
   * @private
   * @param {Array} transactions - The transactions to analyze
   * @returns {Object} - Cash flow trend assessment
   */
  _assessCashFlowTrend(transactions) {
    // Sort transactions by date
    const sortedTransactions = [...transactions].sort((a, b) => {
      return new Date(a.date) - new Date(b.date);
    });
    
    // Group by week and calculate weekly cash flow
    const weeklyCashFlows = {};
    let currentWeekStart = null;
    let weekIndex = 0;
    
    sortedTransactions.forEach(transaction => {
      const transactionDate = new Date(transaction.date);
      
      if (!currentWeekStart) {
        currentWeekStart = new Date(transactionDate);
        weeklyCashFlows[weekIndex] = {
          startDate: transactionDate.toISOString().split('T')[0],
          cashFlow: 0
        };
      }
      
      // Check if this transaction belongs to a new week
      const daysSinceWeekStart = (transactionDate - currentWeekStart) / (1000 * 60 * 60 * 24);
      if (daysSinceWeekStart >= 7) {
        weekIndex++;
        currentWeekStart = new Date(transactionDate);
        weeklyCashFlows[weekIndex] = {
          startDate: transactionDate.toISOString().split('T')[0],
          cashFlow: 0
        };
      }
      
      weeklyCashFlows[weekIndex].cashFlow += transaction.amount;
    });
    
    // Calculate trend using linear regression
    const weeks = Object.keys(weeklyCashFlows);
    if (weeks.length < 2) {
      return {
        direction: 'insufficient data',
        slope: 0,
        strength: 'unknown',
        weeklyCashFlows
      };
    }
    
    const x = weeks.map(Number);
    const y = weeks.map(week => weeklyCashFlows[week].cashFlow);
    
    const n = x.length;
    const sumX = x.reduce((sum, val) => sum + val, 0);
    const sumY = y.reduce((sum, val) => sum + val, 0);
    const sumXY = x.reduce((sum, val, i) => sum + val * y[i], 0);
    const sumXX = x.reduce((sum, val) => sum + val * val, 0);
    
    const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
    const direction = slope > 0 ? 'positive' : slope < 0 ? 'negative' : 'stable';
    
    // Calculate r-squared to assess strength of trend
    const meanY = sumY / n;
    const totalVariation = y.reduce((sum, val) => sum + Math.pow(val - meanY, 2), 0);
    const explainedVariation = y.reduce((sum, val, i) => {
      const predictedY = slope * x[i] + (sumY - slope * sumX) / n;
      return sum + Math.pow(predictedY - meanY, 2);
    }, 0);
    
    const rSquared = explainedVariation / totalVariation;
    let strength;
    
    if (rSquared > 0.7) {
      strength = 'strong';
    } else if (rSquared > 0.4) {
      strength = 'moderate';
    } else {
      strength = 'weak';
    }
    
    return {
      direction,
      slope,
      strength,
      rSquared,
      weeklyCashFlows
    };
  }
  
  /**
   * Helper method to detect seasonality in cash flows
   * @private
   * @param {Object} dailyCashFlows - The daily cash flows to analyze
   * @returns {Object} - Seasonality assessment
   */
  _detectSeasonality(dailyCashFlows) {
    // Simplified seasonality detection based on day-of-week patterns
    const dayOfWeekPatterns = {
      0: { total: 0, count: 0 }, // Sunday
      1: { total: 0, count: 0 }, // Monday
      2: { total: 0, count: 0 }, // Tuesday
      3: { total: 0, count: 0 }, // Wednesday
      4: { total: 0, count: 0 }, // Thursday
      5: { total: 0, count: 0 }, // Friday
      6: { total: 0, count: 0 }  // Saturday
    };
    
    // Group cash flows by day of week
    Object.entries(dailyCashFlows).forEach(([dateStr, cashFlow]) => {
      const date = new Date(dateStr);
      const dayOfWeek = date.getDay();
      
      dayOfWeekPatterns[dayOfWeek].total += cashFlow;
      dayOfWeekPatterns[dayOfWeek].count += 1;
    });
    
    // Calculate average cash flow by day of week
    const dayAverages = Object.entries(dayOfWeekPatterns).map(([day, data]) => {
      return {
        day: parseInt(day),
        dayName: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][parseInt(day)],
        averageCashFlow: data.count > 0 ? data.total / data.count : 0
      };
    });
    
    // Calculate overall average and variance
    const nonZeroDays = dayAverages.filter(day => day.averageCashFlow !== 0);
    if (nonZeroDays.length === 0) {
      return {
        detected: false,
        pattern: 'No seasonal pattern detected',
        dayAverages
      };
    }
    
    const overallAverage = nonZeroDays.reduce((sum, day) => sum + day.averageCashFlow, 0) / nonZeroDays.length;
    const dayVariance = Math.sqrt(nonZeroDays.reduce((sum, day) => {
      return sum + Math.pow(day.averageCashFlow - overallAverage, 2);
    }, 0) / nonZeroDays.length);
    
    const variationCoefficient = dayVariance / Math.abs(overallAverage);
    
    // Identify high and low days
    const highDays = dayAverages
      .filter(day => day.averageCashFlow > overallAverage + (dayVariance * 0.5))
      .map(day => day.dayName);
      
    const lowDays = dayAverages
      .filter(day => day.averageCashFlow < overallAverage - (dayVariance * 0.5))
      .map(day => day.dayName);
    
    // Determine if there's a seasonal pattern
    const hasSeasonalPattern = variationCoefficient > 0.2 && (highDays.length > 0 || lowDays.length > 0);
    
    return {
      detected: hasSeasonalPattern,
      pattern: hasSeasonalPattern ? `Higher cash flow on ${highDays.join(', ')}; Lower on ${lowDays.join(', ')}` : 'No significant seasonal pattern detected',
      dayAverages,
      variationCoefficient
    };
  }
  
  /**
   * Helper method to assess operating cash flow strength
   * @private
   * @param {number} operatingCashFlow - The operating cash flow
   * @param {Array} transactions - The transactions to analyze
   * @returns {Object} - Operating cash flow strength assessment
   */
  _assessOperatingCashFlow(operatingCashFlow, transactions) {
    // Calculate total revenue (all positive transactions)
    const totalRevenue = transactions
      .filter(t => t.amount > 0)
      .reduce((sum, t) => sum + t.amount, 0);
    
    // Calculate operating expenses (negative transactions that are not capital expenditures or financing)
    const operatingExpenses = transactions
      .filter(t => t.amount < 0 && !this._isCapitalExpenditure(t) && !this._isFinancingActivity(t))
      .reduce((sum, t) => sum + Math.abs(t.amount), 0);
    
    // Calculate operating cash flow margin
    const ocfMargin = totalRevenue > 0 ? operatingCashFlow / totalRevenue : 0;
    
    // Determine strength
    let strength;
    if (operatingCashFlow <= 0) {
      strength = 'negative';
    } else if (ocfMargin >= 0.2) {
      strength = 'strong';
    } else if (ocfMargin >= 0.1) {
      strength = 'good';
    } else if (ocfMargin >= 0.05) {
      strength = 'moderate';
    } else {
      strength = 'weak';
    }
    
    return {
      strength,
      ocfMargin: parseFloat(ocfMargin.toFixed(2)),
      operatingCashFlow,
      totalRevenue,
      operatingExpenses
    };
  }
  
  /**
   * Helper method to calculate cash flow to debt ratio
   * @private
   * @param {number} operatingCashFlow - The operating cash flow
   * @param {Array} transactions - The transactions to analyze
   * @returns {number} - Cash flow to debt ratio
   */
  _calculateCashFlowToDebtRatio(operatingCashFlow, transactions) {
    // Identify debt service payments
    const debtServicePayments = transactions
      .filter(t => this._isDebtServicePayment(t))
      .reduce((sum, t) => sum + Math.abs(t.amount), 0);
    
    if (debtServicePayments === 0) return null;
    
    const ratio = operatingCashFlow / debtServicePayments;
    return parseFloat(ratio.toFixed(2));
  }
  
  /**
   * Helper method to calculate cash flow to revenue ratio
   * @private
   * @param {number} operatingCashFlow - The operating cash flow
   * @param {Array} transactions - The transactions to analyze
   * @returns {number} - Cash flow to revenue ratio
   */
  _calculateCashFlowToRevenueRatio(operatingCashFlow, transactions) {
    // Calculate total revenue
    const totalRevenue = transactions
      .filter(t => t.amount > 0)
      .reduce((sum, t) => sum + t.amount, 0);
    
    if (totalRevenue === 0) return null;
    
    const ratio = operatingCashFlow / totalRevenue;
    return parseFloat(ratio.toFixed(2));
  }
  
  /**
   * Helper method to calculate sustainability rating
   * @private
   * @param {number} operatingCashFlow - The operating cash flow
   * @param {number} financingCashFlow - The financing cash flow
   * @param {number} freeCashFlow - The free cash flow
   * @param {number} cashFlowVolatility - The cash flow volatility
   * @returns {Object} - Sustainability rating
   */
  _calculateSustainabilityRating(operatingCashFlow, financingCashFlow, freeCashFlow, cashFlowVolatility) {
    // Simplified implementation
    const score = operatingCashFlow > 0 ? 70 : 30;
    const rating = score > 60 ? 'Good' : score > 40 ? 'Moderate' : 'Poor';
    
    return {
      score,
      rating,
      factors: {
        operatingCashFlowPositive: operatingCashFlow > 0,
        freeCashFlowPositive: freeCashFlow > 0,
        lowVolatility: cashFlowVolatility < 1000
      }
    };
  }
  
  /**
   * Helper method to calculate revenue stability
   * @private
   * @param {Array} transactions - The transactions to analyze
   * @returns {number} - Revenue stability score (0-1)
   */
  _calculateRevenueStability(transactions) {
    // Placeholder implementation
    return 0.75;
  }
  
  /**
   * Helper method to calculate expense predictability
   * @private
   * @param {Array} transactions - The transactions to analyze
   * @returns {number} - Expense predictability score (0-1)
   */
  _calculateExpensePredictability(transactions) {
    // Placeholder implementation
    return 0.65;
  }
}

module.exports = CommercialLendingService;
