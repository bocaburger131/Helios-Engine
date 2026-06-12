import TransactionProcessor from './workers/transactionProcessor.js';
import logger from './utils/logger.js';

const NUM_WORKERS = process.env.NUM_WORKERS || 3;

async function startWorkers() {
  logger.info(`Starting ${NUM_WORKERS} transaction processing workers...`);
  logger.info('For Bull template-learning jobs, run: npm run workers:template-learning (requires Redis + MONGODB_URI)');
  
  const workers = [];
  
  for (let i = 1; i <= NUM_WORKERS; i++) {
    const worker = new TransactionProcessor(`worker-${i}`);
    workers.push(worker);
    
    // Start each worker with a slight delay
    setTimeout(() => {
      worker.start().catch(err => {
        logger.error(`Worker ${i} failed:`, err);
      });
    }, i * 1000);
  }
  
  // Handle graceful shutdown
  process.on('SIGTERM', async () => {
    logger.info('Shutting down workers...');
    process.exit(0);
  });
  
  // Log stats every 30 seconds
  setInterval(async () => {
    for (const worker of workers) {
      const stats = await worker.getStats();
      logger.info(`Worker stats:`, stats);
    }
  }, 30000);
}

startWorkers().catch(err => {
  logger.error('Failed to start workers:', err);
  process.exit(1);
});