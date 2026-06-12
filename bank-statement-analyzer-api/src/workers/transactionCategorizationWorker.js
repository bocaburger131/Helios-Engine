/**
 * Transaction Categorization Worker
 * 
 * This worker processes transactions using the AI categorization cache system
 * integrated with Redis Streams for optimal performance and scalability.
 */

import redisStreamService from '../services/redisStreamService.js';
import riskAnalysisService from '../services/riskAnalysisService.minimal.js';
import logger from '../utils/logger.js';
import Transaction from '../models/Transaction.js';
import Statement from '../models/Statement.js';
import mongoose from 'mongoose';

class TransactionCategorizationWorker {
  constructor() {
    this.workerName = `categorization-worker-${process.pid}`;
    this.isRunning = false;
    this.processedCount = 0;
    this.errorCount = 0;
    this.cacheHitCount = 0;
    this.aiCallCount = 0;
    
    // Bind methods to preserve context
    this.processCategorizationJob = this.processCategorizationJob.bind(this);
    this.handleShutdown = this.handleShutdown.bind(this);
    
    // Set up graceful shutdown
    process.on('SIGINT', this.handleShutdown);
    process.on('SIGTERM', this.handleShutdown);
  }

  async start() {
    try {
      logger.info(`Starting Transaction Categorization Worker: ${this.workerName}`);
      
      // Wait for Redis connection
      if (!redisStreamService.isConnected) {
        await new Promise((resolve) => {
          redisStreamService.once('connected', resolve);
        });
      }

      this.isRunning = true;
      
      // Start processing categorization jobs
      await redisStreamService.startWorker(
        redisStreamService.streams.TRANSACTION_CATEGORIZATION,
        redisStreamService.consumerGroups.CATEGORIZATION_WORKERS,
        this.workerName,
        this.processCategorizationJob,
        {
          batchSize: 5, // Process 5 transactions at a time for efficiency
          blockTime: 2000 // Wait 2 seconds for new messages
        }
      );
      
    } catch (error) {
      logger.error('Error starting categorization worker:', error);
      throw error;
    }
  }

  async processCategorizationJob(data, messageId, context) {
    const startTime = Date.now();
    
    try {
      logger.info(`Processing categorization job ${messageId}`, {
        type: data.type,
        correlationId: data.correlation_id,
        transactionId: data.payload?.transactionId
      });

      switch (data.type) {
        case 'CATEGORIZE_SINGLE_TRANSACTION':
          return await this.categorizeSingleTransaction(data.payload, messageId);
          
        case 'CATEGORIZE_BATCH_TRANSACTIONS':
          return await this.categorizeBatchTransactions(data.payload, messageId);
          
        case 'RECATEGORIZE_TRANSACTION':
          return await this.recategorizeTransaction(data.payload, messageId);
          
        case 'CATEGORIZE_STATEMENT_TRANSACTIONS':
          return await this.categorizeStatementTransactions(data.payload, messageId);
          
        default:
          throw new Error(`Unknown categorization job type: ${data.type}`);
      }
      
    } catch (error) {
      logger.error(`Error processing categorization job ${messageId}:`, error);
      throw error;
    } finally {
      const processingTime = Date.now() - startTime;
      logger.debug(`Categorization job ${messageId} completed in ${processingTime}ms`);
    }
  }

  async categorizeSingleTransaction(payload, messageId) {
    try {
      const { transactionId, transactionData, forceRecategorize = false } = payload;
      
      let transaction;
      if (transactionId) {
        transaction = await Transaction.findById(transactionId);
        if (!transaction) {
          throw new Error(`Transaction ${transactionId} not found`);
        }
      } else if (transactionData) {
        transaction = transactionData;
      } else {
        throw new Error('No transaction data provided');
      }

        // Use the AI categorization cache system (fallback to mock if not available)
        let categorizationResult;
        
        try {
          // Check if the categorizeTransactionWithCache method exists
          if (typeof riskAnalysisService.categorizeTransactionWithCache === 'function') {
            categorizationResult = await riskAnalysisService.categorizeTransactionWithCache(
              transaction,
              { forceRecategorize }
            );
          } else {
            // Fallback to basic categorization
            logger.warn('AI categorization cache not available, using fallback categorization');
            categorizationResult = {
              success: true,
              category: this.fallbackCategorization(transaction),
              subcategory: 'General',
              confidence: 0.5,
              source: 'fallback',
              modelVersion: '1.0',
              processingTime: 100
            };
          }
        } catch (error) {
          logger.error('Error in AI categorization, using fallback:', error);
          categorizationResult = {
            success: true,
            category: this.fallbackCategorization(transaction),
            subcategory: 'General',
            confidence: 0.3,
            source: 'fallback_error',
            modelVersion: '1.0',
            processingTime: 50
          };
        }      // Update transaction in database if we have an ID
      if (transactionId && categorizationResult.success) {
        await Transaction.findByIdAndUpdate(transactionId, {
          category: categorizationResult.category,
          subcategory: categorizationResult.subcategory,
          'metadata.categorization': {
            confidence: categorizationResult.confidence,
            method: categorizationResult.source, // 'cache' or 'ai'
            categorizedAt: new Date(),
            modelVersion: categorizationResult.modelVersion,
            processingTime: categorizationResult.processingTime
          }
        });

        logger.info(`Updated transaction ${transactionId} with category: ${categorizationResult.category}`);
      }

      // Track cache performance
      if (categorizationResult.source === 'cache') {
        this.cacheHitCount++;
      } else {
        this.aiCallCount++;
      }

      this.processedCount++;

      // Emit next stage if this is part of a larger workflow
      if (payload.nextStage === 'ANALYSIS') {
        await redisStreamService.addToStream(
          redisStreamService.streams.TRANSACTION_ANALYSIS,
          {
            type: 'ANALYZE_CATEGORIZED_TRANSACTION',
            payload: {
              transactionId,
              category: categorizationResult.category,
              confidence: categorizationResult.confidence
            },
            correlationId: payload.correlationId || messageId
          }
        );
      }

      return {
        success: true,
        transactionId,
        category: categorizationResult.category,
        subcategory: categorizationResult.subcategory,
        confidence: categorizationResult.confidence,
        source: categorizationResult.source,
        processingTime: categorizationResult.processingTime
      };

    } catch (error) {
      this.errorCount++;
      logger.error('Error categorizing single transaction:', error);
      throw error;
    }
  }

  async categorizeBatchTransactions(payload, messageId) {
    try {
      const { transactionIds, transactionData, statementId, batchSize = 10 } = payload;
      
      let transactions = [];
      
      if (transactionIds && transactionIds.length > 0) {
        transactions = await Transaction.find({ _id: { $in: transactionIds } });
      } else if (transactionData && Array.isArray(transactionData)) {
        transactions = transactionData;
      } else if (statementId) {
        transactions = await Transaction.find({ statementId });
      } else {
        throw new Error('No transaction data provided for batch processing');
      }

      if (transactions.length === 0) {
        return { success: true, processed: 0, message: 'No transactions to process' };
      }

      logger.info(`Processing batch of ${transactions.length} transactions`);

      // Use the batch categorization with cache (fallback if not available)
      let batchResult;
      
      try {
        // Check if the batch categorizeTransactionsWithCache method exists
        if (typeof riskAnalysisService.categorizeTransactionsWithCache === 'function') {
          batchResult = await riskAnalysisService.categorizeTransactionsWithCache(
            transactions,
            { batchSize }
          );
        } else {
          // Fallback to individual categorization
          logger.warn('Batch AI categorization not available, using individual fallback');
          const results = transactions.map((tx, index) => ({
            success: true,
            transactionId: tx._id || `tx-${index}`,
            category: this.fallbackCategorization(tx),
            subcategory: 'General',
            confidence: 0.5,
            source: 'fallback',
            modelVersion: '1.0',
            processingTime: 50
          }));
          
          batchResult = {
            results,
            statistics: {
              total: results.length,
              successful: results.length,
              failed: 0,
              cacheHits: 0,
              aiCalls: results.length,
              cacheHitRate: 0,
              totalProcessingTime: results.length * 50
            }
          };
        }
      } catch (error) {
        logger.error('Error in batch AI categorization, using fallback:', error);
        const results = transactions.map((tx, index) => ({
          success: true,
          transactionId: tx._id || `tx-${index}`,
          category: this.fallbackCategorization(tx),
          subcategory: 'General',
          confidence: 0.3,
          source: 'fallback_error',
          modelVersion: '1.0',
          processingTime: 30
        }));
        
        batchResult = {
          results,
          statistics: {
            total: results.length,
            successful: results.length,
            failed: 0,
            cacheHits: 0,
            aiCalls: 0,
            cacheHitRate: 0,
            totalProcessingTime: results.length * 30
          }
        };
      }

      // Update transactions in database
      const updatePromises = batchResult.results.map(async (result) => {
        if (result.success && result.transactionId) {
          try {
            await Transaction.findByIdAndUpdate(result.transactionId, {
              category: result.category,
              subcategory: result.subcategory,
              'metadata.categorization': {
                confidence: result.confidence,
                method: result.source,
                categorizedAt: new Date(),
                modelVersion: result.modelVersion,
                processingTime: result.processingTime
              }
            });
          } catch (updateError) {
            logger.error(`Error updating transaction ${result.transactionId}:`, updateError);
          }
        }
      });

      await Promise.allSettled(updatePromises);

      // Update statistics
      this.processedCount += batchResult.results.length;
      this.cacheHitCount += batchResult.statistics.cacheHits;
      this.aiCallCount += batchResult.statistics.aiCalls;

      // Trigger next stage for successful categorizations
      const successfulResults = batchResult.results.filter(r => r.success);
      if (successfulResults.length > 0 && payload.nextStage === 'ANALYSIS') {
        await redisStreamService.addToStream(
          redisStreamService.streams.TRANSACTION_ANALYSIS,
          {
            type: 'ANALYZE_CATEGORIZED_BATCH',
            payload: {
              transactionIds: successfulResults.map(r => r.transactionId),
              statementId: statementId
            },
            correlationId: payload.correlationId || messageId
          }
        );
      }

      logger.info(`Batch categorization completed: ${successfulResults.length}/${transactions.length} successful`);

      return {
        success: true,
        totalTransactions: transactions.length,
        successfulCategorizations: successfulResults.length,
        failedCategorizations: batchResult.results.length - successfulResults.length,
        statistics: batchResult.statistics,
        cacheHitRate: batchResult.statistics.cacheHitRate
      };

    } catch (error) {
      this.errorCount++;
      logger.error('Error processing batch categorization:', error);
      throw error;
    }
  }

  async recategorizeTransaction(payload, messageId) {
    try {
      const { transactionId, newCategory, reason } = payload;
      
      const transaction = await Transaction.findById(transactionId);
      if (!transaction) {
        throw new Error(`Transaction ${transactionId} not found`);
      }

      // Force recategorization with AI (fallback if not available)
      let categorizationResult;
      
      try {
        if (typeof riskAnalysisService.categorizeTransactionWithCache === 'function') {
          categorizationResult = await riskAnalysisService.categorizeTransactionWithCache(
            transaction,
            { forceRecategorize: true }
          );
        } else {
          // Fallback categorization
          categorizationResult = {
            success: true,
            category: newCategory || this.fallbackCategorization(transaction),
            subcategory: 'General',
            confidence: 0.5,
            source: 'manual_fallback',
            modelVersion: '1.0'
          };
        }
      } catch (error) {
        logger.error('Error in recategorization, using fallback:', error);
        categorizationResult = {
          success: true,
          category: newCategory || this.fallbackCategorization(transaction),
          subcategory: 'General',
          confidence: 0.3,
          source: 'manual_fallback_error',
          modelVersion: '1.0'
        };
      }

      // Update transaction with new categorization
      await Transaction.findByIdAndUpdate(transactionId, {
        category: newCategory || categorizationResult.category,
        subcategory: categorizationResult.subcategory,
        'metadata.categorization': {
          confidence: categorizationResult.confidence,
          method: 'manual_recategorization',
          categorizedAt: new Date(),
          reason: reason,
          previousCategory: transaction.category,
          modelVersion: categorizationResult.modelVersion
        }
      });

      this.processedCount++;

      // Add to audit log
      await redisStreamService.addToStream(
        redisStreamService.streams.AUDIT_LOG,
        {
          type: 'TRANSACTION_RECATEGORIZED',
          payload: {
            transactionId,
            previousCategory: transaction.category,
            newCategory: newCategory || categorizationResult.category,
            reason,
            userId: payload.userId
          },
          correlationId: payload.correlationId || messageId
        }
      );

      return {
        success: true,
        transactionId,
        previousCategory: transaction.category,
        newCategory: newCategory || categorizationResult.category,
        confidence: categorizationResult.confidence
      };

    } catch (error) {
      this.errorCount++;
      logger.error('Error recategorizing transaction:', error);
      throw error;
    }
  }

  async categorizeStatementTransactions(payload, messageId) {
    try {
      const { statementId, userId } = payload;
      
      const statement = await Statement.findById(statementId);
      if (!statement) {
        throw new Error(`Statement ${statementId} not found`);
      }

      // Get all transactions for this statement
      const transactions = await Transaction.find({ statementId });
      
      if (transactions.length === 0) {
        return { success: true, processed: 0, message: 'No transactions found for statement' };
      }

      logger.info(`Categorizing ${transactions.length} transactions for statement ${statementId}`);

      // Process in batches for better performance (with fallback)
      let batchResult;
      
      try {
        if (typeof riskAnalysisService.categorizeTransactionsWithCache === 'function') {
          batchResult = await riskAnalysisService.categorizeTransactionsWithCache(
            transactions,
            { batchSize: 20 }
          );
        } else {
          // Fallback to individual processing
          const results = transactions.map((tx, index) => ({
            success: true,
            transactionId: tx._id,
            category: this.fallbackCategorization(tx),
            subcategory: 'General',
            confidence: 0.5,
            source: 'fallback',
            modelVersion: '1.0',
            processingTime: 30
          }));
          
          batchResult = {
            results,
            statistics: {
              total: results.length,
              successful: results.length,
              failed: 0,
              cacheHits: 0,
              aiCalls: results.length,
              cacheHitRate: 0,
              totalProcessingTime: results.length * 30
            }
          };
        }
      } catch (error) {
        logger.error('Error in statement categorization, using fallback:', error);
        const results = transactions.map((tx, index) => ({
          success: true,
          transactionId: tx._id,
          category: this.fallbackCategorization(tx),
          subcategory: 'General',
          confidence: 0.3,
          source: 'fallback_error',
          modelVersion: '1.0',
          processingTime: 20
        }));
        
        batchResult = {
          results,
          statistics: {
            total: results.length,
            successful: results.length,
            failed: 0,
            cacheHits: 0,
            aiCalls: 0,
            cacheHitRate: 0,
            totalProcessingTime: results.length * 20
          }
        };
      }

      // Update transactions
      const updatePromises = batchResult.results.map(async (result) => {
        if (result.success) {
          await Transaction.findByIdAndUpdate(result.transactionId, {
            category: result.category,
            subcategory: result.subcategory,
            'metadata.categorization': {
              confidence: result.confidence,
              method: result.source,
              categorizedAt: new Date(),
              modelVersion: result.modelVersion,
              processingTime: result.processingTime
            }
          });
        }
      });

      await Promise.allSettled(updatePromises);

      // Update statement status
      await Statement.findByIdAndUpdate(statementId, {
        'processing.categorization': {
          status: 'COMPLETED',
          completedAt: new Date(),
          totalTransactions: transactions.length,
          categorizedTransactions: batchResult.results.filter(r => r.success).length,
          cacheHitRate: batchResult.statistics.cacheHitRate
        }
      });

      // Update statistics
      this.processedCount += batchResult.results.length;
      this.cacheHitCount += batchResult.statistics.cacheHits;
      this.aiCallCount += batchResult.statistics.aiCalls;

      // Trigger risk analysis for the statement
      await redisStreamService.addToStream(
        redisStreamService.streams.RISK_ANALYSIS,
        {
          type: 'ANALYZE_STATEMENT_RISK',
          payload: {
            statementId,
            userId,
            transactionCount: transactions.length
          },
          correlationId: payload.correlationId || messageId
        }
      );

      return {
        success: true,
        statementId,
        totalTransactions: transactions.length,
        categorizedTransactions: batchResult.results.filter(r => r.success).length,
        statistics: batchResult.statistics
      };

    } catch (error) {
      this.errorCount++;
      logger.error('Error categorizing statement transactions:', error);
      throw error;
    }
  }

  async getWorkerStats() {
    return {
      workerName: this.workerName,
      isRunning: this.isRunning,
      processedCount: this.processedCount,
      errorCount: this.errorCount,
      cacheHitCount: this.cacheHitCount,
      aiCallCount: this.aiCallCount,
      cacheHitRate: this.processedCount > 0 ? (this.cacheHitCount / this.processedCount) * 100 : 0,
      uptime: process.uptime()
    };
  }

  // Fallback categorization method when AI cache is not available
  fallbackCategorization(transaction) {
    if (!transaction || !transaction.description) {
      return 'OTHER';
    }
    
    const description = transaction.description.toLowerCase();
    const amount = Math.abs(transaction.amount || 0);
    
    // Simple rule-based categorization
    if (description.includes('grocery') || description.includes('supermarket') || 
        description.includes('walmart') || description.includes('target')) {
      return 'GROCERIES';
    }
    
    if (description.includes('gas') || description.includes('fuel') || 
        description.includes('shell') || description.includes('exxon')) {
      return 'GAS';
    }
    
    if (description.includes('restaurant') || description.includes('food') || 
        description.includes('dining') || description.includes('cafe')) {
      return 'DINING';
    }
    
    if (description.includes('bank') || description.includes('fee') || 
        description.includes('charge')) {
      return 'BANK_FEES';
    }
    
    if (description.includes('deposit') || description.includes('salary') || 
        description.includes('payroll') || amount > 1000) {
      return 'INCOME';
    }
    
    if (description.includes('transfer') || description.includes('withdrawal')) {
      return 'TRANSFER';
    }
    
    if (description.includes('payment') || description.includes('bill')) {
      return 'BILLS';
    }
    
    return 'OTHER';
  }

  async handleShutdown(signal) {
    logger.info(`Received ${signal}, shutting down categorization worker gracefully...`);
    this.isRunning = false;
    
    // Give time for current processing to complete
    setTimeout(() => {
      process.exit(0);
    }, 5000);
  }
}

// Start worker if this file is run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const worker = new TransactionCategorizationWorker();
  
  worker.start().catch((error) => {
    logger.error('Failed to start categorization worker:', error);
    process.exit(1);
  });
}

export default TransactionCategorizationWorker;
