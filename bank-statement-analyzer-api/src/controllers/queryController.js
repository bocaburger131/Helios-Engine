import { AppError } from '../utils/errors.js';
import Statement from '../models/Statement.js';
import Transaction from '../models/Transaction.js';
import { PerplexityService } from '../services/perplexityService.js';
import logger from '../utils/logger.js';

class QueryController {
  /**
   * Process a natural language query about a bank statement analysis
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware function
   */
  async query(req, res, next) {
    try {
      const { question, statementId } = req.body;
      
      if (!question || !statementId) {
        throw new AppError('Question and statement ID are required', 400);
      }

      // Fetch statement and verify user access
      const statement = await Statement.findById(statementId);
      if (!statement) {
        throw new AppError('Statement not found', 404);
      }

      if (req.user && statement.userId.toString() !== req.user.id) {
        throw new AppError('Access denied', 403);
      }

      // Get basic statement data for context
      const transactions = await Transaction.find({ statementId }).lean();
      
      const context = {
        statementPeriod: `${statement.startDate} to ${statement.endDate}`,
        transactionCount: transactions.length,
        totalCredits: transactions.filter(t => t.type === 'credit')
          .reduce((sum, t) => sum + t.amount, 0),
        totalDebits: transactions.filter(t => t.type === 'debit')
          .reduce((sum, t) => sum + t.amount, 0),
        analysis: statement.analysis || {}
      };

      res.json({
        status: 'success',
        data: {
          question,
          statementId,
          context,
          response: `Based on your statement from ${context.statementPeriod} with ${context.transactionCount} transactions, I can help analyze patterns, risks, and insights. What specific aspect would you like to explore?`,
          timestamp: new Date()
        }
      });
    } catch (error) {
      logger.error('Query processing error:', error);
      next(error);
    }
  }

  /**
   * Process the actual query with the provided question
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware function
   */
  async processQuery(req, res, next) {
    try {
      const { query, statementId, context } = req.body;
      
      if (!query) {
        throw new AppError('Query is required', 400);
      }

      // Initialize Perplexity service for AI processing
      const perplexityService = new PerplexityService();
      
      let analysisContext = {};
      
      // If statementId provided, get specific statement context
      if (statementId) {
        const statement = await Statement.findById(statementId);
        if (statement) {
          if (req.user && statement.userId.toString() !== req.user.id) {
            throw new AppError('Access denied', 403);
          }
          
          const transactions = await Transaction.find({ statementId }).lean();
          analysisContext = {
            statement: {
              id: statement._id,
              period: `${statement.startDate} to ${statement.endDate}`,
              filename: statement.filename,
              analysisResults: statement.analysis
            },
            transactions: {
              count: transactions.length,
              totalCredits: transactions.filter(t => t.type === 'credit')
                .reduce((sum, t) => sum + t.amount, 0),
              totalDebits: transactions.filter(t => t.type === 'debit')
                .reduce((sum, t) => sum + t.amount, 0),
              categories: [...new Set(transactions.map(t => t.category).filter(Boolean))]
            }
          };
        }
      }

      // Process query using AI service
      const prompt = `
        Analyze this bank statement query: "${query}"
        
        Context: ${JSON.stringify(analysisContext, null, 2)}
        
        Provide a helpful, specific answer based on the statement data. If specific numbers are mentioned, reference them accurately.
      `;

      let aiResponse;
      try {
        aiResponse = await perplexityService.processQuery(prompt);
      } catch (aiError) {
        logger.warn('AI service unavailable, providing basic response:', aiError.message);
        aiResponse = this.generateBasicResponse(query, analysisContext);
      }

      res.json({
        status: 'success',
        data: {
          query,
          response: aiResponse,
          context: analysisContext,
          timestamp: new Date(),
          source: aiResponse.includes('AI service') ? 'basic' : 'ai'
        }
      });
    } catch (error) {
      logger.error('Query processing error:', error);
      next(error);
    }
  }

  /**
   * Generate a basic response when AI service is unavailable
   */
  generateBasicResponse(query, context) {
    const queryLower = query.toLowerCase();
    
    if (queryLower.includes('risk') || queryLower.includes('risky')) {
      const riskLevel = context.statement?.analysisResults?.riskLevel || 'unknown';
      return `Based on the analysis, this statement shows a ${riskLevel} risk level. The risk assessment considers factors like NSF transactions, balance patterns, and transaction irregularities.`;
    }
    
    if (queryLower.includes('balance') || queryLower.includes('money')) {
      const credits = context.transactions?.totalCredits || 0;
      const debits = context.transactions?.totalDebits || 0;
      return `The statement shows total credits of $${credits.toFixed(2)} and total debits of $${debits.toFixed(2)}, resulting in a net flow of $${(credits - debits).toFixed(2)}.`;
    }
    
    if (queryLower.includes('transaction') || queryLower.includes('activity')) {
      const count = context.transactions?.count || 0;
      const categories = context.transactions?.categories || [];
      return `This statement contains ${count} transactions across ${categories.length} categories: ${categories.join(', ')}.`;
    }
    
    return `I can help analyze your bank statement data. The statement covers the period ${context.statement?.period || 'unknown'} with ${context.transactions?.count || 0} transactions. What specific aspect would you like to explore?`;
  }

  /**
   * Get the query history for the logged-in user
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware function
   */
  async getQueryHistory(req, res, next) {
    try {
      const userId = req.user?.id;
      
      if (!userId) {
        throw new AppError('Authentication required', 401);
      }

      // Get user's statements with query metadata
      const statements = await Statement.find({ userId })
        .select('filename createdAt analysis queryHistory')
        .sort({ createdAt: -1 })
        .limit(50);

      // Extract query history from statements and any stored queries
      const queryHistory = [];
      
      statements.forEach(statement => {
        if (statement.queryHistory && Array.isArray(statement.queryHistory)) {
          statement.queryHistory.forEach(query => {
            queryHistory.push({
              id: query._id || `${statement._id}_${Date.now()}`,
              statementId: statement._id,
              statementFilename: statement.filename,
              query: query.question,
              response: query.response,
              timestamp: query.timestamp || statement.createdAt,
              type: 'statement_query'
            });
          });
        }
      });

      // Sort by timestamp, most recent first
      queryHistory.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

      res.json({
        status: 'success',
        data: {
          history: queryHistory.slice(0, 100), // Limit to 100 most recent
          total: queryHistory.length,
          hasMore: queryHistory.length > 100
        }
      });
    } catch (error) {
      logger.error('Error fetching query history:', error);
      next(error);
    }
  }
}

export default QueryController;
