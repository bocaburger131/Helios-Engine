import redisStream from '../config/redisStream.js';
import llmCategorization from '../services/llmCategorizationService.js';
import riskAnalysisService from '../services/riskAnalysisService.minimal.js';
import logger from '../utils/logger.js';

class TransactionProcessor {
  constructor(workerId = 'worker-1') {
    this.workerId = workerId;
    this.processed = 0;
  }

  async start() {
    logger.info(`Transaction processor ${this.workerId} starting...`);
    
    // Initialize consumer groups
    await redisStream.createConsumerGroups();
    
    // Process transactions
    await redisStream.processTransactionStream(this.workerId, async (transaction, messageId) => {
      logger.debug(`Processing transaction ${messageId}:`, transaction);
      
      // Step 1: Categorize
      const categorization = await llmCategorization.categorizeTransaction({
        description: transaction.description,
        amount: parseFloat(transaction.amount)
      });
      
      // Step 2: Risk analysis (if needed)
      if (categorization.category === 'Banking' && transaction.amount < 0) {
        // Potential NSF or fee
        await redisStream.client.xadd(
          redisStream.streams.RISK_ANALYSIS,
          '*',
          'transaction_id', transaction.transaction_id,
          'risk_type', 'potential_nsf',
          'amount', transaction.amount,
          'timestamp', Date.now().toString()
        );
      }
      
      // Step 3: Store results
      await redisStream.client.xadd(
        redisStream.streams.PROCESSING_RESULTS,
        '*',
        'transaction_id', transaction.transaction_id,
        'original_description', transaction.description,
        'category', categorization.category,
        'confidence', categorization.confidence.toString(),
        'method', categorization.method,
        'processed_by', this.workerId,
        'timestamp', Date.now().toString()
      );
      
      this.processed++;
      if (this.processed % 100 === 0) {
        logger.info(`Worker ${this.workerId} processed ${this.processed} transactions`);
      }
    });
  }

  async getStats() {
    return {
      workerId: this.workerId,
      processed: this.processed,
      uptime: process.uptime(),
      memory: process.memoryUsage()
    };
  }
}

export default TransactionProcessor;