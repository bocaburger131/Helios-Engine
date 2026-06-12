import logger from '../utils/logger.js';
import { PDFParserService } from './pdfParserService.js';
import { LLMService } from './llmService.js';

export class StatementAnalysisService {
    constructor() {
        this.pdfParser = new PDFParserService();
        this.llmService = new LLMService();
    }

    /**
     * Analyze a processed statement to extract financial insights
     * @param {Object} statement - The processed statement data
     * @param {String} userId - The user ID
     * @returns {Object} Analysis results
     */
    static async analyzeStatement(statement, userId) {
        logger.info(`Analyzing statement for user ${userId}`);
        
        try {
            const transactions = statement.transactions || [];
            
            // Calculate basic metrics
            const totalIncome = transactions
                .filter(t => t.amount > 0)
                .reduce((sum, t) => sum + t.amount, 0);
                
            const totalExpenses = transactions
                .filter(t => t.amount < 0)
                .reduce((sum, t) => sum + Math.abs(t.amount), 0);
                
            const netCashflow = totalIncome - totalExpenses;
            
            // Categorize expenses
            const expensesByCategory = this.categorizeExpenses(transactions);
            
            // Identify recurring transactions
            const recurringTransactions = this.identifyRecurringTransactions(transactions);
            
            return {
                summary: {
                    totalIncome,
                    totalExpenses,
                    netCashflow,
                    transactionCount: transactions.length,
                    startDate: statement.startDate,
                    endDate: statement.endDate,
                },
                expensesByCategory,
                recurringTransactions,
                anomalies: this.detectAnomalies(transactions)
            };
        } catch (error) {
            logger.error(`Error analyzing statement: ${error.message}`, { error });
            throw new Error(`Failed to analyze statement: ${error.message}`);
        }
    }
    
    // Helper methods implementation...
}