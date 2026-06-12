import pdfService from './pdfService.js';
import transactionCategorizationService from './transactionCategorizationService.js';
import riskAnalysisService from './riskAnalysisService.js';
import reportGeneratorService from './reportGeneratorService.js';
import Statement from '../models/Statement.js';
import Transaction from '../models/Transaction.js';
import logger from '../utils/logger.js';

class AnalysisService {
  async analyzeStatement(statementId, userId) {
    try {
      logger.info(`Starting analysis for statement ${statementId}`);

      // 1. Get the statement
      const statement = await Statement.findOne({ _id: statementId, userId });
      if (!statement) {
        throw new Error('Statement not found');
      }

      // Update status to processing
      statement.status = 'processing';
      await statement.save();

      // 2. Parse PDF and extract transactions
      const extractedData = await pdfService.extractTransactions(statement.filePath);
      
      // 3. Save transactions to database
      // This logic is now handled by transactionService and called from the controller
      // const transactions = await this.saveTransactions(extractedData.transactions, statementId, userId);
      
      // 4. Categorize transactions
      const categorizedTransactions = await this.categorizeTransactions(transactions);
      
      // 5. Perform risk analysis
      const riskAnalysis = await riskAnalysisService.analyzeTransactions(categorizedTransactions);
      
      // 6. Generate report
      const report = await reportGeneratorService.generateReport({
        statement,
        transactions: categorizedTransactions,
        riskAnalysis,
        summary: this.generateSummary(categorizedTransactions, riskAnalysis)
      });

      // 7. Update statement with analysis results
      statement.status = 'completed';
      statement.analysis = {
        totalTransactions: categorizedTransactions.length,
        totalIncome: this.calculateTotalIncome(categorizedTransactions),
        totalExpenses: this.calculateTotalExpenses(categorizedTransactions),
        riskScore: riskAnalysis.overallRiskScore,
        categorySummary: this.generateCategorySummary(categorizedTransactions),
        reportPath: report.filePath
      };
      await statement.save();

      logger.info(`Analysis completed for statement ${statementId}`);
      return statement;

    } catch (error) {
      logger.error(`Analysis failed for statement ${statementId}:`, error);
      
      // Update statement status to failed
      await Statement.findByIdAndUpdate(statementId, { 
        status: 'failed',
        error: error.message 
      });
      
      throw error;
    }
  }

  /*
  async saveTransactions(transactionData, statementId, userId) {
    const transactions = [];
    
    for (const txData of transactionData) {
      const transaction = new Transaction({
        statementId,
        userId,
        date: new Date(txData.date),
        description: txData.description,
        amount: txData.amount,
        type: txData.amount > 0 ? 'credit' : 'debit',
        balance: txData.balance,
        originalDescription: txData.description,
        metadata: {
          lineNumber: txData.lineNumber,
          rawText: txData.rawText
        }
      });
      
      await transaction.save();
      transactions.push(transaction);
    }
    
    return transactions;
  }
  */

  async categorizeTransactions(transactions) {
    const categorized = [];
    
    for (const transaction of transactions) {
      const category = await transactionCategorizationService.categorize(transaction);
      transaction.category = category.category;
      transaction.subcategory = category.subcategory;
      transaction.confidence = category.confidence;
      transaction.merchant = category.merchant;
      await transaction.save();
      categorized.push(transaction);
    }
    
    return categorized;
  }

  calculateTotalIncome(transactions) {
    return transactions
      .filter(t => t.type === 'credit')
      .reduce((sum, t) => sum + Math.abs(t.amount), 0);
  }

  calculateTotalExpenses(transactions) {
    return transactions
      .filter(t => t.type === 'debit')
      .reduce((sum, t) => sum + Math.abs(t.amount), 0);
  }

  generateCategorySummary(transactions) {
    const summary = {};
    
    transactions.forEach(transaction => {
      const category = transaction.category || 'Uncategorized';
      if (!summary[category]) {
        summary[category] = {
          count: 0,
          totalAmount: 0,
          transactions: []
        };
      }
      
      summary[category].count++;
      summary[category].totalAmount += Math.abs(transaction.amount);
      summary[category].transactions.push(transaction._id);
    });
    
    return summary;
  }

  generateSummary(transactions, riskAnalysis) {
    const totalIncome = this.calculateTotalIncome(transactions);
    const totalExpenses = this.calculateTotalExpenses(transactions);
    const netFlow = totalIncome - totalExpenses;
    
    return {
      period: this.calculatePeriod(transactions),
      totalTransactions: transactions.length,
      totalIncome,
      totalExpenses,
      netFlow,
      averageTransactionAmount: transactions.length > 0 
        ? transactions.reduce((sum, t) => sum + Math.abs(t.amount), 0) / transactions.length 
        : 0,
      categorySummary: this.generateCategorySummary(transactions),
      riskSummary: {
        overallScore: riskAnalysis.overallRiskScore,
        flaggedTransactions: riskAnalysis.flaggedTransactions.length,
        topRisks: riskAnalysis.risks.slice(0, 3)
      }
    };
  }

  calculatePeriod(transactions) {
    if (transactions.length === 0) {
      return { start: null, end: null };
    }
    
    const dates = transactions.map(t => new Date(t.date));
    const start = new Date(Math.min(...dates));
    const end = new Date(Math.max(...dates));
    
    return { start, end };
  }

  async getAnalysisStatus(statementId, userId) {
    const statement = await Statement.findOne({ _id: statementId, userId });
    if (!statement) {
      throw new Error('Statement not found');
    }
    
    return {
      status: statement.status,
      progress: this.calculateProgress(statement),
      analysis: statement.analysis,
      error: statement.error
    };
  }

  calculateProgress(statement) {
    const statusProgress = {
      'pending': 0,
      'uploading': 10,
      'processing': 50,
      'completed': 100,
      'failed': 0
    };
    
    return statusProgress[statement.status] || 0;
  }
}

export default new AnalysisService();

// In your statement model test file
const createValidStatement = (overrides = {}) => {
  return {
    userId: new mongoose.Types.ObjectId(),
    bankName: 'Test Bank',
    accountName: 'Checking Account',
    accountNumber: '1234567890',
    fileName: 'statement.pdf',
    startDate: new Date('2023-01-01'),
    endDate: new Date('2023-01-31'),
    openingBalance: 1000,
    closingBalance: 1500,
    status: 'processed', // Check valid enum values in your model
    ...overrides
  };
};