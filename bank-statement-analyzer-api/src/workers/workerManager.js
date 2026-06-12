/**
 * Worker Manager
 *
 * Orchestrates Redis Streams workers (categorization + risk analysis).
 * BullMQ statement/macro batch jobs run separately: npm run workers:statement-processing
 */
import TransactionCategorizationWorker from './transactionCategorizationWorker.js';
import RiskAnalysisWorker from './riskAnalysisWorker.js';
import redisStreamService from '../services/redisStreamService.js';
import logger from '../utils/logger.js';
import cluster from 'cluster';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

const isClusterPrimary = cluster.isPrimary ?? cluster.isMaster;

function isMainModule() {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return fileURLToPath(import.meta.url) === path.resolve(entry);
  } catch {
    return false;
  }
}

class WorkerManager {
  constructor(options = {}) {
    this.options = {
      enableClustering: options.enableClustering || false,
      maxWorkers: options.maxWorkers || os.cpus().length,
      workerConfig: {
        // BullMQ statement batch worker: npm run workers:statement-processing (separate process)
        transactionCategorization: { count: 3 },
        riskAnalysis: { count: 2 }
      },
      ...options
    };
    
    this.workers = new Map();
    this.isRunning = false;
    this.masterPid = process.pid;
    this.stats = {
      startTime: null,
      totalProcessed: 0,
      totalErrors: 0,
      workerRestarts: 0
    };
    
    // Bind methods
    this.handleShutdown = this.handleShutdown.bind(this);
    this.handleWorkerExit = this.handleWorkerExit.bind(this);
    
    // Set up graceful shutdown
    process.on('SIGINT', this.handleShutdown);
    process.on('SIGTERM', this.handleShutdown);
    process.on('SIGHUP', this.restart.bind(this));
    
    if (isClusterPrimary) {
      cluster.on('exit', this.handleWorkerExit);
    }
  }

  async start() {
    try {
      this.stats.startTime = new Date();
      logger.info('Starting Worker Manager', {
        enableClustering: this.options.enableClustering,
        maxWorkers: this.options.maxWorkers,
        workerConfig: this.options.workerConfig
      });

      // Initialize Redis Streams service
      await redisStreamService.connect();
      await this.setupStreamsAndConsumerGroups();

      if (this.options.enableClustering && isClusterPrimary) {
        await this.startClusteredWorkers();
      } else {
        await this.startSingleProcessWorkers();
      }

      this.isRunning = true;
      logger.info('Worker Manager started successfully');

      // Start health check and monitoring
      this.startHealthCheck();
      this.startMetricsCollection();

    } catch (error) {
      logger.error('Error starting Worker Manager:', error);
      throw error;
    }
  }

  async setupStreamsAndConsumerGroups() {
    try {
      logger.info('Setting up Redis Streams and Consumer Groups');
      
      // Initialize all streams and consumer groups
      await redisStreamService.initializeStreams();
      
      logger.info('Redis Streams and Consumer Groups initialized successfully');
    } catch (error) {
      logger.error('Error setting up streams and consumer groups:', error);
      throw error;
    }
  }

  async startClusteredWorkers() {
    logger.info('Starting clustered workers');
    
    const workerTypes = Object.keys(this.options.workerConfig);
    let totalWorkers = 0;
    
    for (const workerType of workerTypes) {
      const workerCount = this.options.workerConfig[workerType].count;
      totalWorkers += workerCount;
    }
    
    // Don't exceed max workers
    if (totalWorkers > this.options.maxWorkers) {
      logger.warn(`Total workers (${totalWorkers}) exceeds max workers (${this.options.maxWorkers}), scaling down`);
      totalWorkers = this.options.maxWorkers;
    }
    
    // Fork workers
    for (let i = 0; i < totalWorkers; i++) {
      const workerType = this.determineWorkerType(i, workerTypes);
      const worker = cluster.fork({ WORKER_TYPE: workerType });
      
      this.workers.set(worker.id, {
        worker,
        type: workerType,
        startTime: new Date(),
        restartCount: 0
      });
      
      logger.info(`Forked ${workerType} worker with PID ${worker.process.pid}`);
    }
  }

  async startSingleProcessWorkers() {
    logger.info('Starting single process workers');
    
    const workerPromises = [];

    // Start Transaction Categorization Workers
    for (let i = 0; i < this.options.workerConfig.transactionCategorization.count; i++) {
      const worker = new TransactionCategorizationWorker();
      this.workers.set(`categorization-${i}`, {
        worker,
        type: 'transactionCategorization',
        startTime: new Date()
      });
      workerPromises.push(worker.start());
    }
    
    // Start Risk Analysis Workers
    for (let i = 0; i < this.options.workerConfig.riskAnalysis.count; i++) {
      const worker = new RiskAnalysisWorker();
      this.workers.set(`risk-${i}`, {
        worker,
        type: 'riskAnalysis',
        startTime: new Date()
      });
      workerPromises.push(worker.start());
    }
    
    // Wait for all workers to start
    await Promise.all(workerPromises);
    logger.info(`Started ${this.workers.size} workers successfully`);
  }

  determineWorkerType(index, workerTypes) {
    // Simple round-robin assignment
    const typeIndex = index % workerTypes.length;
    return workerTypes[typeIndex];
  }

  startHealthCheck() {
    setInterval(async () => {
      try {
        await this.performHealthCheck();
      } catch (error) {
        logger.error('Health check failed:', error);
      }
    }, 30000); // Every 30 seconds
  }

  async performHealthCheck() {
    const healthStatus = {
      timestamp: new Date(),
      workers: {},
      redis: false,
      overallHealth: 'healthy'
    };

    // Check Redis connection
    try {
      healthStatus.redis = redisStreamService.isConnected;
      if (!healthStatus.redis) {
        healthStatus.overallHealth = 'unhealthy';
        logger.warn('Redis connection is down');
      }
    } catch (error) {
      healthStatus.redis = false;
      healthStatus.overallHealth = 'unhealthy';
    }

    // Check workers (in single process mode)
    if (!this.options.enableClustering) {
      for (const [workerId, workerInfo] of this.workers) {
        try {
          if (workerInfo.worker.getWorkerStats) {
            const stats = await workerInfo.worker.getWorkerStats();
            healthStatus.workers[workerId] = {
              type: workerInfo.type,
              status: stats.isRunning ? 'running' : 'stopped',
              processedCount: stats.processedCount,
              errorCount: stats.errorCount,
              uptime: stats.uptime
            };
          }
        } catch (error) {
          healthStatus.workers[workerId] = {
            type: workerInfo.type,
            status: 'error',
            error: error.message
          };
          healthStatus.overallHealth = 'degraded';
        }
      }
    }

    // Log health status if not healthy
    if (healthStatus.overallHealth !== 'healthy') {
      logger.warn('System health check:', healthStatus);
    }

    return healthStatus;
  }

  startMetricsCollection() {
    setInterval(async () => {
      try {
        await this.collectMetrics();
      } catch (error) {
        logger.error('Metrics collection failed:', error);
      }
    }, 60000); // Every minute
  }

  async collectMetrics() {
    const metrics = {
      timestamp: new Date(),
      uptime: Date.now() - this.stats.startTime.getTime(),
      workers: {
        total: this.workers.size,
        byType: {}
      },
      processing: {
        totalProcessed: 0,
        totalErrors: 0,
        ratePerMinute: 0
      },
      redis: {
        streamLengths: {},
        consumerGroups: {}
      }
    };

    // Collect worker metrics
    if (!this.options.enableClustering) {
      for (const [workerId, workerInfo] of this.workers) {
        const workerType = workerInfo.type;
        
        if (!metrics.workers.byType[workerType]) {
          metrics.workers.byType[workerType] = {
            count: 0,
            totalProcessed: 0,
            totalErrors: 0
          };
        }
        
        metrics.workers.byType[workerType].count++;
        
        try {
          if (workerInfo.worker.getWorkerStats) {
            const stats = await workerInfo.worker.getWorkerStats();
            metrics.workers.byType[workerType].totalProcessed += stats.processedCount || 0;
            metrics.workers.byType[workerType].totalErrors += stats.errorCount || 0;
            
            metrics.processing.totalProcessed += stats.processedCount || 0;
            metrics.processing.totalErrors += stats.errorCount || 0;
          }
        } catch (error) {
          logger.error(`Error collecting metrics for worker ${workerId}:`, error);
        }
      }
    }

    // Calculate processing rate
    const uptimeMinutes = metrics.uptime / (1000 * 60);
    metrics.processing.ratePerMinute = uptimeMinutes > 0 ? 
      metrics.processing.totalProcessed / uptimeMinutes : 0;

    // Collect Redis metrics
    try {
      const streamNames = Object.values(redisStreamService.streams);
      for (const streamName of streamNames) {
        const length = await redisStreamService.getStreamLength(streamName);
        metrics.redis.streamLengths[streamName] = length;
      }
    } catch (error) {
      logger.error('Error collecting Redis metrics:', error);
    }

    // Update global stats
    this.stats.totalProcessed = metrics.processing.totalProcessed;
    this.stats.totalErrors = metrics.processing.totalErrors;

    // Log metrics summary
    logger.info('Worker Manager Metrics:', {
      totalWorkers: metrics.workers.total,
      totalProcessed: metrics.processing.totalProcessed,
      totalErrors: metrics.processing.totalErrors,
      ratePerMinute: Math.round(metrics.processing.ratePerMinute * 100) / 100,
      uptime: Math.round(uptimeMinutes * 100) / 100 + ' minutes'
    });

    return metrics;
  }

  async handleWorkerExit(worker, code, signal) {
    const workerInfo = this.workers.get(worker.id);
    
    if (workerInfo) {
      logger.warn(`Worker ${worker.id} (${workerInfo.type}) exited`, {
        code,
        signal,
        pid: worker.process.pid
      });
      
      this.workers.delete(worker.id);
      this.stats.workerRestarts++;
      
      // Restart worker if not shutting down
      if (this.isRunning && code !== 0) {
        logger.info(`Restarting worker ${worker.id} (${workerInfo.type})`);
        
        const newWorker = cluster.fork({ WORKER_TYPE: workerInfo.type });
        this.workers.set(newWorker.id, {
          worker: newWorker,
          type: workerInfo.type,
          startTime: new Date(),
          restartCount: (workerInfo.restartCount || 0) + 1
        });
      }
    }
  }

  async restart() {
    logger.info('Restarting Worker Manager...');
    
    await this.stop();
    await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds
    await this.start();
    
    logger.info('Worker Manager restarted successfully');
  }

  async stop() {
    logger.info('Stopping Worker Manager...');
    this.isRunning = false;
    
    if (this.options.enableClustering && isClusterPrimary) {
      // Stop clustered workers
      for (const [workerId, workerInfo] of this.workers) {
        try {
          workerInfo.worker.kill('SIGTERM');
        } catch (error) {
          logger.error(`Error stopping worker ${workerId}:`, error);
        }
      }
      
      // Wait for workers to exit
      await new Promise(resolve => setTimeout(resolve, 5000));
      
    } else {
      // Stop single process workers
      const stopPromises = [];
      
      for (const [workerId, workerInfo] of this.workers) {
        if (workerInfo.worker.handleShutdown) {
          stopPromises.push(
            new Promise(resolve => {
              workerInfo.worker.handleShutdown('SIGTERM');
              setTimeout(resolve, 3000); // Give 3 seconds to stop
            })
          );
        }
      }
      
      await Promise.all(stopPromises);
    }
    
    // Disconnect from Redis
    try {
      await redisStreamService.disconnect();
    } catch (error) {
      logger.error('Error disconnecting from Redis:', error);
    }
    
    this.workers.clear();
    logger.info('Worker Manager stopped');
  }

  async handleShutdown(signal) {
    logger.info(`Received ${signal}, shutting down Worker Manager gracefully...`);
    
    try {
      await this.stop();
      process.exit(0);
    } catch (error) {
      logger.error('Error during shutdown:', error);
      process.exit(1);
    }
  }

  async getStatus() {
    const status = {
      isRunning: this.isRunning,
      masterPid: this.masterPid,
      stats: this.stats,
      workers: {},
      config: this.options
    };
    
    // Get worker status
    for (const [workerId, workerInfo] of this.workers) {
      status.workers[workerId] = {
        type: workerInfo.type,
        startTime: workerInfo.startTime,
        restartCount: workerInfo.restartCount || 0
      };
      
      if (!this.options.enableClustering && workerInfo.worker.getWorkerStats) {
        try {
          const stats = await workerInfo.worker.getWorkerStats();
          status.workers[workerId].stats = stats;
        } catch (error) {
          status.workers[workerId].error = error.message;
        }
      }
    }
    
    return status;
  }
}

// Handle cluster worker setup
if (cluster.isWorker) {
  const workerType = process.env.WORKER_TYPE;
  
  logger.info(`Starting ${workerType} worker in cluster mode`, {
    workerId: cluster.worker.id,
    pid: process.pid
  });
  
  let worker;
  
  switch (workerType) {
    case 'transactionCategorization':
      worker = new TransactionCategorizationWorker();
      break;
    case 'riskAnalysis':
      worker = new RiskAnalysisWorker();
      break;
    default:
      logger.error(`Unknown worker type: ${workerType}`);
      process.exit(1);
  }
  
  worker.start().catch((error) => {
    logger.error(`Failed to start ${workerType} worker:`, error);
    process.exit(1);
  });
}

// Start worker manager if this file is run directly (Windows-safe path compare)
if (isMainModule() && isClusterPrimary) {
  const workerManager = new WorkerManager({
    enableClustering: process.env.ENABLE_CLUSTERING === 'true',
    maxWorkers: parseInt(process.env.MAX_WORKERS) || os.cpus().length,
    workerConfig: {
      transactionCategorization: { count: parseInt(process.env.CATEGORIZATION_WORKERS) || 3 },
      riskAnalysis: { count: parseInt(process.env.RISK_WORKERS) || 2 }
    }
  });
  
  workerManager.start().catch((error) => {
    logger.error('Failed to start Worker Manager:', error);
    process.exit(1);
  });
}

export default WorkerManager;
