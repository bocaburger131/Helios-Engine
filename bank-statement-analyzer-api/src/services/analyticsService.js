import Statement from '../models/Statement.js';
import Transaction from '../models/Transaction.js';
import perplexityEnhancer from './perplexityEnhancementService.js';
import logger from '../utils/logger.js';

class IndustryStandards {
  constructor() {
    // Implementation
  }
}

class RiskModels {
  constructor() {
    // Implementation
  }
}

class TValueCalculator {
  constructor() {
    // Implementation
  }
}

class AnalyticsService {
  constructor() {
    this.industryStandards = new IndustryStandards();
    this.riskModels = new RiskModels();
    this.tValueCalculator = new TValueCalculator();
    
    this.categoryKeywords = {
        'equipment': ['equipment', 'machinery', 'tools', 'hardware'],
        'maintenance': ['repair', 'service', 'maintenance', 'parts'],
        'fuel': ['fuel', 'gas', 'diesel', 'petroleum'],
        'insurance': ['insurance', 'premium', 'coverage'],
        'finance': ['loan', 'lease', 'finance', 'payment'],
        'payroll': ['payroll', 'salary', 'wages', 'compensation'],
        'utilities': ['electric', 'water', 'phone', 'internet'],
        'supplies': ['supplies', 'materials', 'inventory'],
        'other': []
    };

    this.logger = logger;
  }

  async analyzeSpendingPatterns(transactions) {
    try {
        const patterns = {
            byCategory: {},
            byMonth: {},
            trends: [],
            anomalies: []
        };

        // Group by category
        transactions.forEach(transaction => {
            const category = this._categorizeTransaction(transaction.description);
            patterns.byCategory[category] = (patterns.byCategory[category] || 0) + Math.abs(transaction.amount);
        });

        // Group by month
        transactions.forEach(transaction => {
            const month = new Date(transaction.date).toISOString().slice(0, 7);
            patterns.byMonth[month] = (patterns.byMonth[month] || 0) + Math.abs(transaction.amount);
        });

        return patterns;
    } catch (error) {
        console.error('Error analyzing spending patterns:', error);
        return {
            byCategory: {},
            byMonth: {},
            trends: [],
            anomalies: []
        };
    }
  }

  async analyzeCashFlow(transactions) {
      try {
          const dailyBalances = await this.calculateDailyBalances(transactions);
          const paymentHistory = await this.extractPaymentHistory(transactions);

          const inflows = transactions.filter(t => t.amount > 0).reduce((sum, t) => sum + t.amount, 0);
          const outflows = transactions.filter(t => t.amount < 0).reduce((sum, t) => sum + Math.abs(t.amount), 0);

          return {
              totalInflow: inflows,
              totalOutflow: outflows,
              netFlow: inflows - outflows,
              averageDaily: (inflows - outflows) / Math.max(Object.keys(dailyBalances).length, 1),
              dailyBalances,
              paymentHistory
          };
      } catch (error) {
          console.error('Error analyzing cash flow:', error);
          return {
              totalInflow: 0,
              totalOutflow: 0,
              netFlow: 0,
              averageDaily: 0,
              dailyBalances: {},
              paymentHistory: []
          };
      }
  }

  async calculateBusinessMetrics(data) {
      try {
          const { transactions, openingBalance, closingBalance } = data;
          
          return {
              // ELFA Standards
              assetUtilization: await this.calculateAssetUtilization(transactions),
              equipmentROI: await this.calculateEquipmentROI(transactions),
              
              // Financial Metrics
              workingCapitalRatio: this.calculateWorkingCapitalRatio(openingBalance, closingBalance),
              cashConversionCycle: this.calculateCashConversionCycle(transactions),
              
              // Risk Indicators
              debtServiceCoverage: this.calculateDebtServiceCoverage(transactions),
              liquidityRatio: this.calculateLiquidityRatio(openingBalance, closingBalance),
              
              // Growth Metrics
              revenueGrowth: this.calculateRevenueGrowth(transactions),
              expenseRatio: this.calculateExpenseRatio(transactions)
          };
      } catch (error) {
          console.error('Error calculating business metrics:', error);
          return {
              assetUtilization: 0,
              equipmentROI: 0,
              workingCapitalRatio: 0,
              cashConversionCycle: 0,
              debtServiceCoverage: 0,
              liquidityRatio: 0,
              revenueGrowth: 0,
              expenseRatio: 0
          };
      }
  }

  async calculateDailyBalances(transactions) {
      const dailyBalances = {};
      let runningBalance = 0;
      
      transactions
          .sort((a, b) => new Date(a.date) - new Date(b.date))
          .forEach(transaction => {
              const date = new Date(transaction.date).toISOString().split('T')[0];
              runningBalance += transaction.amount;
              dailyBalances[date] = runningBalance;
          });
      
      return dailyBalances;
  }

  async extractPaymentHistory(transactions) {
      return transactions
          .filter(t => t.amount < 0)
          .map(t => ({
              date: t.date,
              amount: Math.abs(t.amount),
              description: t.description
          }));
  }

  async calculateAssetUtilization(transactions) {
      // Placeholder for asset utilization calculation
      return 0.85; // 85% utilization
  }

  async calculateEquipmentROI(transactions) {
      // Placeholder for equipment ROI calculation
      return 0.12; // 12% ROI
  }

  calculateWorkingCapitalRatio(openingBalance, closingBalance) {
      const avgBalance = (openingBalance + closingBalance) / 2;
      return avgBalance > 0 ? 1.5 : 0;
  }

  calculateCashConversionCycle(transactions) {
      // Placeholder - typically days sales outstanding + days inventory - days payable
      return 45; // days
  }

  calculateDebtServiceCoverage(transactions) {
      const income = transactions.filter(t => t.amount > 0).reduce((sum, t) => sum + t.amount, 0);
      const debtPayments = transactions.filter(t => 
          t.description && t.description.toLowerCase().includes('loan')
      ).reduce((sum, t) => sum + Math.abs(t.amount), 0);
      
      return debtPayments > 0 ? income / debtPayments : 0;
  }

  calculateLiquidityRatio(openingBalance, closingBalance) {
      const avgBalance = (openingBalance + closingBalance) / 2;
      return avgBalance > 0 ? 2.0 : 0;
  }

  calculateRevenueGrowth(transactions) {
      // Placeholder for revenue growth calculation
      return 0.08; // 8% growth
  }

  calculateExpenseRatio(transactions) {
      const income = transactions.filter(t => t.amount > 0).reduce((sum, t) => sum + t.amount, 0);
      const expenses = transactions.filter(t => t.amount < 0).reduce((sum, t) => sum + Math.abs(t.amount), 0);
      
      return income > 0 ? expenses / income : 0;
  }

  _categorizeTransaction(description) {
      if (!description) return 'other';
      
      const desc = description.toLowerCase();
      
      for (const [category, keywords] of Object.entries(this.categoryKeywords)) {
          if (keywords.some(keyword => desc.includes(keyword))) {
              return category;
          }
      }
      
      return 'other';
  }

  async getStatementAnalytics(statementId) {
    // Get all transactions for the statement
    const transactions = await Transaction.find({ statementId });
    
    if (transactions.length === 0) {
      return {
        totalTransactions: 0,
        totalIncome: 0,
        totalExpenses: 0,
        netCashFlow: 0,
        averageTransaction: 0,
        largestExpense: null,
        largestIncome: null,
        categoryBreakdown: {},
        monthlyTrend: [],
        dailyBalance: []
      };
    }

    // Calculate basic metrics
    let totalIncome = 0;
    let totalExpenses = 0;
    let largestExpense = null;
    let largestIncome = null;
    const categoryBreakdown = {};

    transactions.forEach(transaction => {
      if (transaction.type === 'credit') {
        totalIncome += transaction.amount;
        if (!largestIncome || transaction.amount > largestIncome.amount) {
          largestIncome = transaction;
        }
      } else {
        totalExpenses += transaction.amount;
        if (!largestExpense || transaction.amount > largestExpense.amount) {
          largestExpense = transaction;
        }
      }

      // Category breakdown
      const category = transaction.category || 'Uncategorized';
      if (!categoryBreakdown[category]) {
        categoryBreakdown[category] = {
          count: 0,
          total: 0,
          percentage: 0
        };
      }
      categoryBreakdown[category].count++;
      categoryBreakdown[category].total += transaction.amount;
    });

    // Calculate percentages for categories
    const totalAmount = totalIncome + totalExpenses;
    Object.keys(categoryBreakdown).forEach(category => {
      categoryBreakdown[category].percentage = 
        (categoryBreakdown[category].total / totalAmount * 100).toFixed(2);
    });

    // Calculate monthly trend
    const monthlyTrend = this.calculateMonthlyTrend(transactions);

    // Calculate daily balance
    const dailyBalance = this.calculateDailyBalance(transactions);

    return {
      totalTransactions: transactions.length,
      totalIncome,
      totalExpenses,
      netCashFlow: totalIncome - totalExpenses,
      averageTransaction: totalAmount / transactions.length,
      largestExpense,
      largestIncome,
      categoryBreakdown,
      monthlyTrend,
      dailyBalance
    };
  }

  calculateMonthlyTrend(transactions) {
    const monthlyData = {};

    transactions.forEach(transaction => {
      const date = new Date(transaction.date);
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;

      if (!monthlyData[monthKey]) {
        monthlyData[monthKey] = {
          income: 0,
          expenses: 0,
          transactionCount: 0
        };
      }

      if (transaction.type === 'credit') {
        monthlyData[monthKey].income += transaction.amount;
      } else {
        monthlyData[monthKey].expenses += transaction.amount;
      }
      monthlyData[monthKey].transactionCount++;
    });

    // Convert to array and sort by month
    return Object.entries(monthlyData)
      .map(([month, data]) => ({
        month,
        ...data,
        netCashFlow: data.income - data.expenses
      }))
      .sort((a, b) => a.month.localeCompare(b.month));
  }

  calculateDailyBalance(transactions) {
    // Sort transactions by date
    const sortedTransactions = [...transactions].sort((a, b) => 
      new Date(a.date) - new Date(b.date)
    );

    const dailyBalance = [];
    let runningBalance = 0;

    sortedTransactions.forEach(transaction => {
      runningBalance += transaction.type === 'credit' 
        ? transaction.amount 
        : -transaction.amount;

      dailyBalance.push({
        date: transaction.date,
        balance: runningBalance,
        transaction: transaction.description
      });
    });

    return dailyBalance;
  }

  /**
   * Enhance analytics with AI insights
   */
  async enhanceWithAI(statementId) {
      try {
          // First, run basic analytics
          const basicAnalytics = await this.getStatementAnalytics(statementId);
          
          // Then enhance with Perplexity
          const aiEnhancements = await perplexityEnhancer.enhanceTransactions(statementId);
          
          // Combine results
          return {
              ...basicAnalytics,
              aiInsights: aiEnhancements.insights,
              enhancedTransactions: aiEnhancements.enhanced,
              lastEnhanced: new Date()
          };
      } catch (error) {
          console.error('Error enhancing analytics with AI:', error);
          // Return basic analytics if AI fails
          return this.getStatementAnalytics(statementId);
      }
  }

  /**
   * Get smart recommendations based on spending patterns
   */
  async getSmartRecommendations(userId, period = 'month') {
      try {
          const recommendations = await perplexityEnhancer.generateSpendingRecommendations(userId, period);
          return recommendations;
      } catch (error) {
          console.error('Error getting smart recommendations:', error);
          return {
              recommendations: [],
              error: 'Unable to generate recommendations at this time'
          };
      }
  }

  /**
   * Detect recurring transactions using AI
   */
  async detectRecurring(userId) {
      try {
          const recurring = await perplexityEnhancer.detectRecurringTransactions(userId);
          return recurring;
      } catch (error) {
          console.error('Error detecting recurring transactions:', error);
          return { items: [] };
      }
  }

  /**
   * Enhanced categorization for uncategorized transactions
   */
  async recategorizeTransactions(statementId) {
      const transactions = await Transaction.find({ 
          statementId,
          category: { $in: ['Other', 'Uncategorized', null] }
      });

      if (transactions.length === 0) {
          return { message: 'No transactions need recategorization' };
      }

      const enhanced = await perplexityEnhancer.processBatch(transactions);
      
      // Update database
      for (const enhancement of enhanced) {
          await Transaction.findByIdAndUpdate(
              enhancement.transactionId,
              {
                  category: enhancement.category,
                  subCategory: enhancement.subCategory,
                  merchant: enhancement.merchant,
                  tags: enhancement.tags,
                  'metadata.recategorizedAt': new Date()
              }
          );
      }

      return {
          recategorized: enhanced.length,
          message: `Successfully recategorized ${enhanced.length} transactions`
      };
  }

  async analyzeTransactions(transactions) {
    try {
      const analysis = {
        totalIncome: this.calculateTotalIncome(transactions),
        totalExpenses: this.calculateTotalExpenses(transactions),
        netCashFlow: 0,
        averageBalance: this.calculateAverageBalance(transactions),
        transactionCount: transactions.length,
        categoryBreakdown: this.getCategoryBreakdown(transactions),
        monthlyTrends: this.getMonthlyTrends(transactions)
      };
      
      analysis.netCashFlow = analysis.totalIncome - analysis.totalExpenses;
      
      return analysis;
    } catch (error) {
      this.logger.error('Error analyzing transactions:', error);
      throw error;
    }
  }

  calculateTotalIncome(transactions) {
    return transactions
      .filter(t => t.amount > 0)
      .reduce((sum, t) => sum + t.amount, 0);
  }

  calculateTotalExpenses(transactions) {
    return Math.abs(
      transactions
        .filter(t => t.amount < 0)
        .reduce((sum, t) => sum + t.amount, 0)
    );
  }

  calculateAverageBalance(transactions) {
    if (transactions.length === 0) return 0;
    const totalBalance = transactions.reduce((sum, t) => sum + (t.balance || 0), 0);
    return totalBalance / transactions.length;
  }

  getCategoryBreakdown(transactions) {
    const breakdown = {};
    transactions.forEach(t => {
      const category = t.category || 'Uncategorized';
      if (!breakdown[category]) {
        breakdown[category] = { count: 0, total: 0 };
      }
      breakdown[category].count++;
      breakdown[category].total += Math.abs(t.amount);
    });
    return breakdown;
  }

  getMonthlyTrends(transactions) {
    const trends = {};
    transactions.forEach(t => {
      const month = new Date(t.date).toISOString().substring(0, 7);
      if (!trends[month]) {
        trends[month] = { income: 0, expenses: 0, net: 0 };
      }
      if (t.amount > 0) {
        trends[month].income += t.amount;
      } else {
        trends[month].expenses += Math.abs(t.amount);
      }
      trends[month].net = trends[month].income - trends[month].expenses;
    });
    return trends;
  }

  // FIX: Add placeholder implementations for missing methods

  async assessCollateralValue(transactions) {
    this.logger.info('assessCollateralValue called - placeholder implementation');
    return 0;
  }

  async analyzeMarketPosition(businessProfile) {
    this.logger.info('analyzeMarketPosition called - placeholder implementation');
    return 'N/A';
  }

  extractCashFlows(transactions) {
    this.logger.info('extractCashFlows called - placeholder implementation');
    return [];
  }

  async determineDiscountRate(transactions) {
    this.logger.info('determineDiscountRate called - placeholder implementation');
    return 0.05;
  }

  // Additional analysis methods that might be called
  async performFinancialAnalysis(statementId, options = {}) {
    this.logger.info('performFinancialAnalysis called - placeholder implementation');
    return {
      creditScore: 700,
      riskLevel: 'medium',
      liquidityRatio: 1.5,
      debtToIncomeRatio: 0.3,
      recommendations: [
        'Maintain current cash reserves',
        'Consider reducing variable expenses'
      ],
      insights: [
        'Stable income pattern detected',
        'Expenses within normal range'
      ]
    };
  }

  calculateCreditScore(financialData) {
    this.logger.info('calculateCreditScore called - placeholder implementation');
    return {
      score: 700,
      rating: 'B',
      factors: {
        paymentHistory: 0.35,
        creditUtilization: 0.30,
        accountAge: 0.15,
        creditMix: 0.10,
        newCredit: 0.10
      }
    };
  }

  assessRiskProfile(transactions, businessProfile) {
    this.logger.info('assessRiskProfile called - placeholder implementation');
    return {
      overallRisk: 'medium',
      riskFactors: [],
      mitigationStrategies: []
    };
  }
}

// Export a singleton instance
export default new AnalyticsService();