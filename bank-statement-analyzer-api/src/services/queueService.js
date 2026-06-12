import Bull from 'bull';
import statementProcessor from './statementProcessor.js';
import aiService from './aiService.js';
import emailService from './emailService.js';
import logger from '../utils/logger.js';

class QueueService {
  constructor() {
    const redisConfig = {
      redis: {
        host: process.env.REDIS_HOST || 'localhost',
        port: process.env.REDIS_PORT || 6379,
        password: process.env.REDIS_PASSWORD
      }
    };

    // Create queues
    this.statementQueue = new Bull('statement-processing', redisConfig);
    this.aiQueue = new Bull('ai-categorization', redisConfig);
    this.emailQueue = new Bull('email-notifications', redisConfig);
    this.analyticsQueue = new Bull('analytics-generation', redisConfig);

    this.setupProcessors();
  }

  setupProcessors() {
    // Statement processing
    this.statementQueue.process(async (job) => {
      const { statementId } = job.data;
      logger.info(`Processing statement job: ${statementId}`);
      
      try {
        const result = await statementProcessor.processStatement(statementId);
        
        // Queue AI categorization for transactions
        await this.aiQueue.add('categorize-transactions', {
          statementId,
          transactionIds: result.transactions.map(t => t._id)
        });
        
        // Queue email notification
        await this.emailQueue.add('statement-processed', {
          statementId,
          userId: result.statement.userId,
          transactionCount: result.transactions.length
        });
        
        return result;
      } catch (error) {
        logger.error(`Statement processing failed: ${error.message}`);
        throw error;
      }
    });

    // AI categorization
    this.aiQueue.process('categorize-transactions', async (job) => {
      const { transactionIds } = job.data;
      logger.info(`Categorizing ${transactionIds.length} transactions`);
      
      const Transaction = (await import('../models/Transaction.js')).default;
      const transactions = await Transaction.find({ _id: { $in: transactionIds } });
      
      const categorizations = await aiService.batchCategorize(transactions);
      
      // Update transactions with AI results
      for (let i = 0; i < transactions.length; i++) {
        const transaction = transactions[i];
        const aiResult = categorizations[i];
        
        transaction.category = aiResult.category;
        transaction.subCategory = aiResult.subCategory;
        transaction.merchant.name = aiResult.merchant;
        transaction.metadata.aiAnalysis = aiResult;
        
        await transaction.save();
      }
      
      return { categorized: transactions.length };
    });

    // Email notifications
    this.emailQueue.process(async (job) => {
      const { type, data } = job.data;
      
      switch (type) {
        case 'statement-processed':
          await emailService.sendStatementProcessed(data);
          break;
        case 'anomaly-detected':
          await emailService.sendAnomalyAlert(data);
          break;
        case 'monthly-summary':
          await emailService.sendMonthlySummary(data);
          break;
      }
    });

    // Analytics generation
    this.analyticsQueue.process(async (job) => {
      const { userId, period } = job.data;
      logger.info(`Generating analytics for user ${userId}, period: ${period}`);
      
      // Generate analytics
      const analytics = await this.generateAnalytics(userId, period);
      
      // Store in cache or database
      return analytics;
    });

    // Error handling
    this.setupErrorHandlers();
  }

  setupErrorHandlers() {
    this.statementQueue.on('failed', (job, err) => {
      logger.error(`Statement job ${job.id} failed:`, err);
    });

    this.aiQueue.on('failed', (job, err) => {
      logger.error(`AI job ${job.id} failed:`, err);
    });
  }

  async addStatementJob(statementId, priority = 0) {
    return this.statementQueue.add(
      { statementId },
      {
        priority,
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 2000
        }
      }
    );
  }

  async generateAnalytics(userId, period) {
    // Implement analytics generation
    const Transaction = (await import('../models/Transaction.js')).default;
    const { startDate, endDate } = this.getPeriodDates(period);
    
    const transactions = await Transaction.getByDateRange(userId, startDate, endDate);
    const categoryTotals = await Transaction.getCategoryTotals(userId, startDate, endDate);
    const patterns = await aiService.analyzeSpendingPatterns(transactions, userId);
    
    return {
      period,
      transactions: transactions.length,
      totalSpent: transactions
        .filter(t => t.type === 'debit')
        .reduce((sum, t) => sum + t.amount, 0),
      totalIncome: transactions
        .filter(t => t.type === 'credit')
        .reduce((sum, t) => sum + t.amount, 0),
      categoryBreakdown: categoryTotals,
      insights: patterns?.insights || [],
      generatedAt: new Date()
    };
  }

  getPeriodDates(period) {
    const endDate = new Date();
    const startDate = new Date();
    
    switch (period) {
      case 'week':
        startDate.setDate(endDate.getDate() - 7);
        break;
      case 'month':
        startDate.setMonth(endDate.getMonth() - 1);
        break;
      case 'quarter':
        startDate.setMonth(endDate.getMonth() - 3);
        break;
      case 'year':
        startDate.setFullYear(endDate.getFullYear() - 1);
        break;
    }
    
    return { startDate, endDate };
  }

  async getJobStatus(queueName, jobId) {
    const queue = this[`${queueName}Queue`];
    if (!queue) throw new Error(`Queue ${queueName} not found`);
    
    const job = await queue.getJob(jobId);
    if (!job) throw new Error(`Job ${jobId} not found`);
    
    return {
      id: job.id,
      status: await job.getState(),
      progress: job.progress(),
      data: job.data,
      result: job.returnvalue,
      failedReason: job.failedReason
    };
  }
}

export default new QueueService();