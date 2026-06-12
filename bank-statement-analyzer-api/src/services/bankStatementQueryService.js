const logger = require('../config/logger');
const llmService = require('./llmService');
const analysisService = require('./analysisService');
const { AnalysisNotFoundError } = require('../utils/errors');

/**
 * Service for handling natural language queries about bank statements
 */
class BankStatementQueryService {
  constructor() {
    this.commonQueries = {
      payroll: ['payroll', 'salary', 'wages', 'employee payments', 'staff', 'labor'],
      dailyBalance: ['daily balance', 'average balance', 'balance trends', 'ending balance'],
      cashFlow: ['cash flow', 'incoming funds', 'outgoing funds', 'inflows', 'outflows'],
      vendors: ['vendor', 'supplier', 'recurring expenses', 'bills', 'payments to'],
      revenue: ['revenue', 'income', 'earnings', 'sales', 'deposits'],
      expenses: ['spending', 'expense', 'cost', 'payment']
    };
  }
  
  /**
   * Process a natural language query about a bank statement analysis
   * @param {string} analysisId - ID of the analysis to query
   * @param {string} question - The natural language question
   * @returns {Object} - The response to the question
   */
  async queryBankStatements(analysisId, question) {
    logger.info(`Processing bank statement query for analysis ${analysisId}: "${question}"`);
    
    try {
      // Retrieve analysis data
      const analysis = await analysisService.getAnalysisById(analysisId);
      
      if (!analysis) {
        throw new AnalysisNotFoundError(`Analysis with ID ${analysisId} not found`);
      }
      
      // Prepare context for LLM
      const context = this.prepareQueryContext(analysis, question);
      
      // Process with LLM
      const response = await llmService.processQuery(question, context);
      
      return {
        success: true,
        question,
        answer: response.data.answer,
        confidence: response.data.confidence || 0.85,
        relatedData: response.data.relatedData || {},
        analysisId
      };
    } catch (error) {
      logger.error(`Error processing bank statement query: ${error.message}`, { error });
      
      return {
        success: false,
        question,
        error: error.message,
        analysisId
      };
    }
  }
  
  /**
   * Identify the type of question being asked
   * @private
   * @param {string} question - The question text
   * @returns {string} - The identified question type
   */
  identifyQuestionType(question) {
    const normalizedQuestion = question.toLowerCase();
    
    for (const [type, keywords] of Object.entries(this.commonQueries)) {
      if (keywords.some(keyword => normalizedQuestion.includes(keyword))) {
        return type;
      }
    }
    return 'general';
  }
  
  /**
   * Prepare relevant context for the LLM based on the question type
   * @private
   * @param {Object} analysis - The complete analysis object
   * @param {string} question - The question text
   * @returns {Object} - Focused context for the LLM
   */
  prepareQueryContext(analysis, question) {
    const questionType = this.identifyQuestionType(question);
    let relevantData = {};
    
    switch (questionType) {
      case 'payroll':
        relevantData = this.extractPayrollData(analysis);
        break;
      case 'dailyBalance':
        relevantData = this.extractBalanceData(analysis);
        break;
      case 'vendors':
        relevantData = this.extractVendorData(analysis);
        break;
      case 'revenue':
        relevantData = this.extractRevenueData(analysis);
        break;
      case 'expenses':
        relevantData = this.extractExpenseData(analysis);
        break;
      case 'cashFlow':
        relevantData = this.extractCashFlowData(analysis);
        break;
      default:
        // For general questions, provide comprehensive but filtered context
        relevantData = this.createComprehensiveContext(analysis);
    }
    
    return relevantData;
  }
  
  /**
   * Extract payroll-related data from the analysis
   * @private
   * @param {Object} analysis - Complete analysis object
   * @returns {Object} - Payroll-focused data
   */
  extractPayrollData(analysis) {
    const payrollKeywords = [
      'payroll', 'salary', 'wage', 'employee', 'staff', 'labor',
      'adp', 'paychex', 'gusto', 'workday', 'hr', 'human resource'
    ];
    
    const payrollTransactions = analysis.transactions.filter(tx => {
      // Find transactions with payroll-related descriptions
      const desc = tx.description ? tx.description.toLowerCase() : '';
      return (
        tx.type === 'withdrawal' && 
        payrollKeywords.some(keyword => desc.includes(keyword))
      );
    });
    
    // Calculate payroll metrics
    const totalPayroll = payrollTransactions.reduce((sum, tx) => sum + Math.abs(tx.amount), 0);
    const payrollFrequency = this.detectPayrollFrequency(payrollTransactions);
    
    return {
      payrollTransactions,
      payrollMetrics: {
        totalPayroll,
        frequency: payrollFrequency,
        averagePayroll: payrollTransactions.length > 0 ? 
          totalPayroll / payrollTransactions.length : 0,
        payrollCount: payrollTransactions.length
      },
      timeframe: {
        startDate: analysis.startDate,
        endDate: analysis.endDate
      }
    };
  }
  
  /**
   * Extract balance-related data from the analysis
   * @private
   * @param {Object} analysis - Complete analysis object
   * @returns {Object} - Balance-focused data
   */
  extractBalanceData(analysis) {
    // Create daily balance history if available
    let dailyBalances = [];
    
    // Construct daily balances if not directly provided
    if (analysis.transactions && analysis.transactions.length > 0) {
      const sortedTransactions = [...analysis.transactions].sort(
        (a, b) => new Date(a.date) - new Date(b.date)
      );
      
      let runningBalance = analysis.startingBalance || 0;
      const balanceByDate = new Map();
      
      // Calculate running balance for each date
      sortedTransactions.forEach(tx => {
        runningBalance += (tx.type === 'deposit' ? 1 : -1) * Math.abs(tx.amount);
        balanceByDate.set(tx.date, runningBalance);
      });
      
      // Convert to array format
      dailyBalances = Array.from(balanceByDate.entries()).map(([date, balance]) => ({
        date,
        balance
      }));
    }
    
    // Calculate balance metrics
    const balances = dailyBalances.map(day => day.balance);
    const averageBalance = balances.length > 0 ? 
      balances.reduce((sum, bal) => sum + bal, 0) / balances.length : 0;
    
    return {
      dailyBalances,
      balanceMetrics: {
        averageBalance,
        lowestBalance: balances.length > 0 ? Math.min(...balances) : 0,
        highestBalance: balances.length > 0 ? Math.max(...balances) : 0,
        endingBalance: balances.length > 0 ? balances[balances.length - 1] : 0,
        overdraftDays: balances.filter(bal => bal < 0).length
      },
      timeframe: {
        startDate: analysis.startDate,
        endDate: analysis.endDate
      }
    };
  }
  
  /**
   * Extract vendor payment data from the analysis
   * @private
   * @param {Object} analysis - Complete analysis object
   * @returns {Object} - Vendor-focused data
   */
  extractVendorData(analysis) {
    // Group transactions by possible vendor
    const vendorTransactions = new Map();
    
    // Only look at withdrawals
    const withdrawals = analysis.transactions.filter(tx => tx.type === 'withdrawal');
    
    withdrawals.forEach(tx => {
      const desc = tx.description || '';
      // Skip likely non-vendor transactions
      if (desc.toLowerCase().includes('transfer') || 
          desc.toLowerCase().includes('withdrawal') ||
          desc.toLowerCase().includes('atm')) {
        return;
      }
      
      // Use description as vendor key
      if (!vendorTransactions.has(desc)) {
        vendorTransactions.set(desc, []);
      }
      vendorTransactions.get(desc).push(tx);
    });
    
    // Calculate vendor metrics
    const vendors = Array.from(vendorTransactions.entries()).map(([vendor, transactions]) => {
      const total = transactions.reduce((sum, tx) => sum + Math.abs(tx.amount), 0);
      
      return {
        vendor,
        transactionCount: transactions.length,
        totalSpent: total,
        averagePayment: total / transactions.length,
        transactions
      };
    });
    
    // Sort by total spent descending
    vendors.sort((a, b) => b.totalSpent - a.totalSpent);
    
    return {
      vendors: vendors.slice(0, 20), // Top 20 vendors
      vendorMetrics: {
        totalVendors: vendors.length,
        totalVendorSpend: vendors.reduce((sum, v) => sum + v.totalSpent, 0),
        topVendorPercentage: vendors.length > 0 ? 
          vendors[0].totalSpent / vendors.reduce((sum, v) => sum + v.totalSpent, 0) : 0
      },
      timeframe: {
        startDate: analysis.startDate,
        endDate: analysis.endDate
      }
    };
  }
  
  /**
   * Extract revenue data from the analysis
   * @private
   * @param {Object} analysis - Complete analysis object
   * @returns {Object} - Revenue-focused data
   */
  extractRevenueData(analysis) {
    // Filter deposit transactions
    const deposits = analysis.transactions.filter(tx => tx.type === 'deposit');
    
    // Group by month for trend analysis
    const monthlyDeposits = new Map();
    
    deposits.forEach(tx => {
      const date = new Date(tx.date);
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      
      if (!monthlyDeposits.has(monthKey)) {
        monthlyDeposits.set(monthKey, {
          month: monthKey,
          deposits: [],
          total: 0
        });
      }
      
      const monthData = monthlyDeposits.get(monthKey);
      monthData.deposits.push(tx);
      monthData.total += tx.amount;
    });
    
    // Calculate revenue metrics
    const totalRevenue = deposits.reduce((sum, tx) => sum + tx.amount, 0);
    const monthlyRevenue = Array.from(monthlyDeposits.values());
    
    // Sort by month
    monthlyRevenue.sort((a, b) => a.month.localeCompare(b.month));
    
    // Calculate month-over-month growth
    const monthlyGrowth = [];
    for (let i = 1; i < monthlyRevenue.length; i++) {
      const currentMonth = monthlyRevenue[i];
      const previousMonth = monthlyRevenue[i-1];
      
      const growthRate = previousMonth.total === 0 ? 0 : 
        (currentMonth.total - previousMonth.total) / previousMonth.total;
      
      monthlyGrowth.push({
        month: currentMonth.month,
        previousMonth: previousMonth.month,
        growth: growthRate
      });
    }
    
    return {
      deposits,
      revenueMetrics: {
        totalRevenue,
        averageDeposit: deposits.length > 0 ? totalRevenue / deposits.length : 0,
        largestDeposit: deposits.length > 0 ? 
          Math.max(...deposits.map(d => d.amount)) : 0,
        depositCount: deposits.length,
        monthlyRevenue
      },
      trends: {
        monthlyGrowth,
        averageMonthlyGrowth: monthlyGrowth.length > 0 ?
          monthlyGrowth.reduce((sum, m) => sum + m.growth, 0) / monthlyGrowth.length : 0
      },
      timeframe: {
        startDate: analysis.startDate,
        endDate: analysis.endDate
      }
    };
  }
  
  /**
   * Extract expense data from the analysis
   * @private
   * @param {Object} analysis - Complete analysis object
   * @returns {Object} - Expense-focused data
   */
  extractExpenseData(analysis) {
    // Filter withdrawal transactions
    const expenses = analysis.transactions.filter(tx => tx.type === 'withdrawal');
    
    // Group by category if available
    const categorizedExpenses = new Map();
    
    expenses.forEach(tx => {
      const category = tx.category || 'Uncategorized';
      
      if (!categorizedExpenses.has(category)) {
        categorizedExpenses.set(category, {
          category,
          transactions: [],
          total: 0
        });
      }
      
      const categoryData = categorizedExpenses.get(category);
      categoryData.transactions.push(tx);
      categoryData.total += Math.abs(tx.amount);
    });
    
    // Calculate expense metrics
    const totalExpenses = expenses.reduce((sum, tx) => sum + Math.abs(tx.amount), 0);
    const expensesByCategory = Array.from(categorizedExpenses.values());
    
    // Sort by total amount
    expensesByCategory.sort((a, b) => b.total - a.total);
    
    return {
      expenses,
      expenseMetrics: {
        totalExpenses,
        averageExpense: expenses.length > 0 ? totalExpenses / expenses.length : 0,
        largestExpense: expenses.length > 0 ? 
          Math.max(...expenses.map(e => Math.abs(e.amount))) : 0,
        expenseCount: expenses.length,
        expensesByCategory
      },
      timeframe: {
        startDate: analysis.startDate,
        endDate: analysis.endDate
      }
    };
  }
  
  /**
   * Extract cash flow data from the analysis
   * @private
   * @param {Object} analysis - Complete analysis object
   * @returns {Object} - Cash flow-focused data
   */
  extractCashFlowData(analysis) {
    const ledgerInflow = (tx) => {
      const ty = String(tx.type || '').toUpperCase();
      if (['CREDIT', 'DEPOSIT', 'CR', 'INFLOW'].includes(ty)) return true;
      if (['DEBIT', 'WITHDRAWAL', 'DR', 'WD', 'OUTFLOW'].includes(ty)) return false;
      return Number(tx.amount) > 0;
    };
    const ledgerOutflow = (tx) => {
      const ty = String(tx.type || '').toUpperCase();
      if (['DEBIT', 'WITHDRAWAL', 'DR', 'WD', 'OUTFLOW'].includes(ty)) return true;
      if (['CREDIT', 'DEPOSIT', 'CR', 'INFLOW'].includes(ty)) return false;
      return Number(tx.amount) < 0;
    };

    const txs = analysis.transactions || [];
    const deposits = txs.filter(ledgerInflow);
    const withdrawals = txs.filter(ledgerOutflow);
    
    // Group by month for trend analysis
    const monthlyCashFlow = new Map();
    
    txs.forEach(tx => {
      const date = new Date(tx.date);
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      
      if (!monthlyCashFlow.has(monthKey)) {
        monthlyCashFlow.set(monthKey, {
          month: monthKey,
          inflow: 0,
          outflow: 0,
          netCashFlow: 0
        });
      }
      
      const monthData = monthlyCashFlow.get(monthKey);
      if (ledgerInflow(tx)) {
        monthData.inflow += Math.abs(Number(tx.amount) || 0);
      } else {
        monthData.outflow += Math.abs(Number(tx.amount) || 0);
      }
      monthData.netCashFlow = monthData.inflow - monthData.outflow;
    });
    
    // Calculate cash flow metrics
    const totalInflow = deposits.reduce((sum, tx) => sum + Math.abs(Number(tx.amount) || 0), 0);
    const totalOutflow = withdrawals.reduce((sum, tx) => sum + Math.abs(Number(tx.amount) || 0), 0);
    const netCashFlow = totalInflow - totalOutflow;
    
    // Sort cash flow by month
    const monthlyCashFlowArray = Array.from(monthlyCashFlow.values());
    monthlyCashFlowArray.sort((a, b) => a.month.localeCompare(b.month));
    
    return {
      cashFlowMetrics: {
        totalInflow,
        totalOutflow,
        netCashFlow,
        cashFlowRatio: totalOutflow === 0 ? 0 : totalInflow / totalOutflow,
        monthlyCashFlow: monthlyCashFlowArray
      },
      depositMetrics: {
        depositCount: deposits.length,
        averageDeposit: deposits.length > 0 ? totalInflow / deposits.length : 0
      },
      withdrawalMetrics: {
        withdrawalCount: withdrawals.length,
        averageWithdrawal: withdrawals.length > 0 ? totalOutflow / withdrawals.length : 0
      },
      timeframe: {
        startDate: analysis.startDate,
        endDate: analysis.endDate
      }
    };
  }
  
  /**
   * Create a comprehensive context for general questions
   * @private
   * @param {Object} analysis - Complete analysis object
   * @returns {Object} - Streamlined but comprehensive context
   */
  createComprehensiveContext(analysis) {
    // Create a streamlined version of the analysis with key data
    const balanceData = this.extractBalanceData(analysis);
    const cashFlowData = this.extractCashFlowData(analysis);
    const revenueData = this.extractRevenueData(analysis);
    const expenseData = this.extractExpenseData(analysis);
    
    // Filter the top vendors only
    const vendorData = this.extractVendorData(analysis);
    const topVendors = vendorData.vendors.slice(0, 5);
    
    // Limit transaction data to prevent context overload
    const sampleTransactions = analysis.transactions
      .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount))
      .slice(0, 20);
    
    return {
      summary: {
        accountInfo: analysis.accountInfo || {},
        timeframe: {
          startDate: analysis.startDate,
          endDate: analysis.endDate
        },
        transactionCount: analysis.transactions.length,
        balanceMetrics: balanceData.balanceMetrics,
        cashFlowMetrics: cashFlowData.cashFlowMetrics
      },
      revenue: revenueData.revenueMetrics,
      expenses: expenseData.expenseMetrics,
      topVendors,
      sampleTransactions
    };
  }
  
  /**
   * Detect the payroll frequency based on transaction patterns
   * @private
   * @param {Array} payrollTransactions - Payroll-related transactions
   * @returns {string} - Detected frequency (Weekly, Bi-Weekly, Monthly, etc.)
   */
  detectPayrollFrequency(payrollTransactions) {
    if (payrollTransactions.length < 2) {
      return 'Unknown';
    }
    
    // Sort transactions by date
    const sortedTransactions = [...payrollTransactions].sort(
      (a, b) => new Date(a.date) - new Date(b.date)
    );
    
    // Calculate intervals between transactions
    const intervals = [];
    for (let i = 1; i < sortedTransactions.length; i++) {
      const currentDate = new Date(sortedTransactions[i].date);
      const previousDate = new Date(sortedTransactions[i-1].date);
      
      const daysDiff = Math.round((currentDate - previousDate) / (1000 * 60 * 60 * 24));
      intervals.push(daysDiff);
    }
    
    // Calculate average interval
    const avgInterval = intervals.reduce((sum, interval) => sum + interval, 0) / intervals.length;
    
    // Determine frequency based on average interval
    if (avgInterval < 10) {
      return 'Weekly';
    } else if (avgInterval < 18) {
      return 'Bi-Weekly';
    } else if (avgInterval < 33) {
      return 'Monthly';
    } else {
      return 'Irregular';
    }
  }
}

export default new BankStatementQueryService();
