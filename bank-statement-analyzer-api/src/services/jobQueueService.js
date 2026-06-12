import statementController from '../controllers/statementController.js';
import logger from '../utils/logger.js';

class JobQueueService {
  constructor() {
    this.queue = [];
    this.isProcessing = false;
    this.maxRetries = 3;
    this.processDelay = 1000; // 1 second delay between jobs
  }

  addJob(jobData) {
    // Validate required fields
    if (!jobData.dealId) {
      throw new Error('Job must include a dealId');
    }

    // Create job object with metadata
    const job = {
      ...jobData,
      id: `job_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      retries: 0,
      createdAt: new Date(),
      status: 'pending',
      processingStarted: null,
      processingCompleted: null,
      error: null
    };
    
    this.queue.push(job);
    logger.info(`New job added to queue`, {
      jobId: job.id,
      dealId: job.dealId,
      queueSize: this.queue.length
    });
    
    // Start processing if not already running
    this.startProcessing();
    
    return job.id; // Return job ID for status checking
  }

  async processNextJob() {
    if (this.queue.length === 0) {
      this.isProcessing = false;
      return;
    }

    this.isProcessing = true;
    const job = this.queue[0]; // Look at next job but don't remove yet
    
    try {
      job.status = 'processing';
      job.processingStarted = new Date();

      logger.info(`Processing job for Deal ID: ${job.dealId}`, {
        jobId: job.id,
        dealId: job.dealId,
        attempt: job.retries + 1
      });

      await statementController.processMultipleStatements(job.dealId, job.files);
      
      // Job completed successfully
      job.status = 'completed';
      job.processingCompleted = new Date();
      this.queue.shift(); // Remove job from queue

      logger.info(`Successfully processed job for Deal ID: ${job.dealId}`, {
        jobId: job.id,
        dealId: job.dealId,
        duration: job.processingCompleted - job.processingStarted
      });

    } catch (error) {
      job.error = error.message;
      logger.error(`Job failed for Deal ID: ${job.dealId}`, {
        jobId: job.id,
        dealId: job.dealId,
        error: error.message,
        attempt: job.retries + 1
      });

      // Handle retry logic
      if (job.retries < this.maxRetries) {
        job.retries++;
        job.status = 'retrying';
        // Move to end of queue for retry
        this.queue.shift();
        this.queue.push(job);
        
        logger.info(`Job queued for retry: ${job.dealId}`, {
          jobId: job.id,
          dealId: job.dealId,
          nextAttempt: job.retries + 1
        });
      } else {
        // Max retries reached, mark as failed
        job.status = 'failed';
        this.queue.shift();
        logger.error(`Job failed permanently for Deal ID: ${job.dealId}`, {
          jobId: job.id,
          dealId: job.dealId,
          error: error.message,
          totalAttempts: this.maxRetries
        });
      }
    }

    // Process next job after delay
    setTimeout(() => this.processNextJob(), this.processDelay);
  }

  startProcessing() {
    if (!this.isProcessing) {
      this.processNextJob();
    }
  }

  // Get status of a specific job
  getJobStatus(jobId) {
    const job = this.queue.find(j => j.id === jobId);
    if (!job) return null;

    return {
      id: job.id,
      dealId: job.dealId,
      status: job.status,
      retries: job.retries,
      createdAt: job.createdAt,
      processingStarted: job.processingStarted,
      processingCompleted: job.processingCompleted,
      error: job.error
    };
  }

  // Get overall queue status
  getQueueStatus() {
    return {
      queueLength: this.queue.length,
      isProcessing: this.isProcessing,
      pendingJobs: this.queue.map(job => ({
        id: job.id,
        dealId: job.dealId,
        status: job.status,
        retries: job.retries,
        waitTime: Date.now() - job.createdAt
      }))
    };
  }

  // Clear all failed jobs from the queue
  clearFailedJobs() {
    const initialLength = this.queue.length;
    this.queue = this.queue.filter(job => job.status !== 'failed');
    return initialLength - this.queue.length;
  }
}

// Export a single instance to ensure one queue for the whole app
const jobQueueService = new JobQueueService();
export default jobQueueService;
