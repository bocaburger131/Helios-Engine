import llmCategorization from './llmCategorizationService.js';
import logger from '../utils/logger.js';

export class IntelligentCategorizationService {
  constructor() {
    this.feedbackQueue = [];
    this.batchSize = 10;
  }

  /**
   * Process transactions with intelligent categorization and robust error handling
   */
  async categorizeTransactions(transactions) {
    try {
      // Input validation
      if (!transactions) {
        throw new Error('Transactions parameter is required');
      }

      if (!Array.isArray(transactions)) {
        throw new Error('Transactions must be an array');
      }

      if (transactions.length === 0) {
        logger.info('No transactions to categorize');
        return [];
      }

      const categorizedTransactions = [];
      let successCount = 0;
      let errorCount = 0;
      
      for (const transaction of transactions) {
        try {
          // Validate individual transaction
          if (!transaction || typeof transaction !== 'object') {
            logger.warn('Skipping invalid transaction object');
            categorizedTransactions.push({
              ...transaction,
              category: 'Other',
              categoryConfidence: 0,
              categoryMethod: 'error_invalid_object',
              error: 'Invalid transaction object'
            });
            errorCount++;
            continue;
          }

          // Check for required fields
          if (!transaction.description && transaction.description !== '') {
            logger.warn('Skipping transaction with missing description');
            categorizedTransactions.push({
              ...transaction,
              category: 'Other',
              categoryConfidence: 0,
              categoryMethod: 'error_missing_description',
              error: 'Missing description'
            });
            errorCount++;
            continue;
          }

          if ((!transaction.amount && transaction.amount !== 0) || 
              typeof transaction.amount !== 'number' || 
              isNaN(transaction.amount)) {
            logger.warn('Skipping transaction with invalid amount');
            categorizedTransactions.push({
              ...transaction,
              category: 'Other',
              categoryConfidence: 0,
              categoryMethod: 'error_invalid_amount',
              error: 'Invalid amount'
            });
            errorCount++;
            continue;
          }

          // Get LLM categorization with error handling
          let llmResult;
          try {
            llmResult = await llmCategorization.categorizeTransaction(transaction);
          } catch (llmError) {
            logger.error('LLM categorization failed:', llmError);
            llmResult = {
              category: 'Other',
              confidence: 0,
              method: 'error_llm_failed',
              error: llmError.message
            };
          }

          // Validate LLM result
          if (!llmResult || typeof llmResult !== 'object') {
            llmResult = {
              category: 'Other',
              confidence: 0,
              method: 'error_invalid_llm_result'
            };
          }

          // Apply categorization with fallbacks
          const categorized = {
            ...transaction,
            category: llmResult.category || 'Other',
            categoryConfidence: typeof llmResult.confidence === 'number' ? llmResult.confidence : 0,
            categoryMethod: llmResult.method || 'unknown',
            suggestedCategories: Array.isArray(llmResult.alternativeCategories) ? 
              llmResult.alternativeCategories : [],
            categoryReasoning: llmResult.reasoning || null,
            categoryError: llmResult.error || null
          };
          
          categorizedTransactions.push(categorized);
          successCount++;
          
          // Log for learning (no PII)
          if (llmResult.confidence < 0.8) {
            logger.info(`Low confidence categorization: ${llmResult.confidence} for category ${llmResult.category}`);
          }
          
        } catch (transactionError) {
          logger.error('Transaction categorization error:', transactionError);
          categorizedTransactions.push({
            ...transaction,
            category: 'Other',
            categoryConfidence: 0,
            categoryMethod: 'error_processing_failed',
            error: transactionError.message
          });
          errorCount++;
        }
      }

      logger.info(`Categorization complete: ${successCount} successful, ${errorCount} errors`);
      return categorizedTransactions;
      
    } catch (error) {
      logger.error('Batch categorization failed:', error);
      
      // Return original transactions with error categorization
      if (Array.isArray(transactions)) {
        return transactions.map(transaction => ({
          ...transaction,
          category: 'Other',
          categoryConfidence: 0,
          categoryMethod: 'error_batch_failed',
          error: error.message
        }));
      }
      
      throw error;
    }
  }

  /**
   * Learn from user feedback
   */
  async provideFeedback(transactionFingerprint, correctCategory) {
    this.feedbackQueue.push({
      fingerprint: transactionFingerprint,
      category: correctCategory,
      timestamp: Date.now()
    });
    
    // Process in batches
    if (this.feedbackQueue.length >= this.batchSize) {
      await this.processFeedbackBatch();
    }
  }

  /**
   * Process feedback batch
   */
  async processFeedbackBatch() {
    const batch = this.feedbackQueue.splice(0, this.batchSize);
    
    for (const feedback of batch) {
      // Update model with feedback
      // Note: We only store the fingerprint and category, not the actual transaction
      llmCategorization.merchantFingerprints.set(feedback.fingerprint, {
        category: feedback.category,
        confidence: 1.0, // User-confirmed
        lastSeen: feedback.timestamp
      });
    }
    
    logger.info(`Processed ${batch.length} feedback items`);
  }

  /**
   * Get categorization statistics (privacy-safe)
   */
  getStatistics() {
    const stats = {
      totalCategories: llmCategorization.categoryPatterns.size,
      totalMerchantFingerprints: llmCategorization.merchantFingerprints.size,
      categoryDistribution: {}
    };
    
    // Count fingerprints per category
    for (const [, data] of llmCategorization.merchantFingerprints) {
      stats.categoryDistribution[data.category] = 
        (stats.categoryDistribution[data.category] || 0) + 1;
    }
    
    return stats;
  }
}

export default new IntelligentCategorizationService();