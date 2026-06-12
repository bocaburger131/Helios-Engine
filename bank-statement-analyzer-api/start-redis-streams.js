/**
 * Redis Streams Application Startup Script
 * 
 * This script initializes and starts the complete Redis Streams infrastructure
 * for the bank statement analyzer with AI categorization cache integration.
 */

import WorkerManager from './src/workers/workerManager.js';
import redisStreamService from './src/services/redisStreamService.js';
import logger from './src/utils/logger.js';
import mongoose from 'mongoose';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import os from 'os';

// Import API routes
import statementRoutes from './src/routes/statementRoutes.js';
import authRoutes from './src/routes/authRoutes.js';

class BankStatementAnalyzerApp {
  constructor() {
    this.app = express();
    this.workerManager = null;
    this.server = null;
    this.isShuttingDown = false;
    
    // Configuration
    this.config = {
      port: process.env.PORT || 3001,
      mongoUri: process.env.MONGODB_URI || 'mongodb://localhost:27017/bank-statement-analyzer',
      redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',
      enableWorkers: process.env.ENABLE_WORKERS !== 'false',
      enableClustering: process.env.ENABLE_CLUSTERING === 'true',
      maxWorkers: parseInt(process.env.MAX_WORKERS) || os.cpus().length,
      // Statement/macro batch: BullMQ via npm run workers:statement-processing (not managed here)
      workerConfig: {
        transactionCategorization: { count: parseInt(process.env.CATEGORIZATION_WORKERS) || 3 },
        riskAnalysis: { count: parseInt(process.env.RISK_WORKERS) || 2 }
      }
    };
    
    // Bind methods
    this.gracefulShutdown = this.gracefulShutdown.bind(this);
    
    // Set up graceful shutdown
    process.on('SIGINT', this.gracefulShutdown);
    process.on('SIGTERM', this.gracefulShutdown);
    process.on('uncaughtException', this.handleUncaughtException.bind(this));
    process.on('unhandledRejection', this.handleUnhandledRejection.bind(this));
  }

  async start() {
    try {
      logger.info('🚀 Starting Bank Statement Analyzer with Redis Streams');
      
      // Step 1: Connect to MongoDB
      await this.connectToMongoDB();
      
      // Step 2: Setup Express application
      await this.setupExpressApp();
      
      // Step 3: Connect to Redis and initialize streams
      await this.initializeRedisStreams();
      
      // Step 4: Start workers (if enabled)
      if (this.config.enableWorkers) {
        await this.startWorkers();
      }
      
      // Step 5: Start Express server
      await this.startServer();
      
      logger.info(`🎉 Bank Statement Analyzer started successfully on port ${this.config.port}`);
      logger.info('📊 Application Status:', {
        mongodb: 'connected',
        redis: redisStreamService.isConnected ? 'connected' : 'disconnected',
        workers: this.config.enableWorkers ? 'enabled' : 'disabled',
        clustering: this.config.enableClustering ? 'enabled' : 'disabled',
        port: this.config.port
      });
      
    } catch (error) {
      logger.error('💥 Failed to start application:', error);
      throw error;
    }
  }

  async connectToMongoDB() {
    try {
      logger.info('📊 Connecting to MongoDB...');
      
      await mongoose.connect(this.config.mongoUri, {
        useNewUrlParser: true,
        useUnifiedTopology: true,
        maxPoolSize: 10,
        serverSelectionTimeoutMS: 5000,
        socketTimeoutMS: 45000,
      });
      
      logger.info('✅ MongoDB connected successfully');
      
      // Set up mongoose event listeners
      mongoose.connection.on('error', (error) => {
        logger.error('MongoDB connection error:', error);
      });
      
      mongoose.connection.on('disconnected', () => {
        logger.warn('MongoDB disconnected');
      });
      
    } catch (error) {
      logger.error('❌ MongoDB connection failed:', error);
      throw error;
    }
  }

  async setupExpressApp() {
    try {
      logger.info('🌐 Setting up Express application...');
      
      // Security middleware
      this.app.use(helmet({
        crossOriginEmbedderPolicy: false,
        contentSecurityPolicy: {
          directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            scriptSrc: ["'self'"],
            imgSrc: ["'self'", "data:", "https:"],
          },
        },
      }));
      
      // CORS configuration
      this.app.use(cors({
        origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
        credentials: true,
        methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key']
      }));
      
      // Rate limiting
      const limiter = rateLimit({
        windowMs: 15 * 60 * 1000, // 15 minutes
        max: process.env.RATE_LIMIT || 100, // limit each IP to 100 requests per windowMs
        message: {
          error: 'Too many requests from this IP, please try again later.'
        }
      });
      this.app.use(limiter);
      
      // Compression and parsing
      this.app.use(compression());
      this.app.use(express.json({ limit: '50mb' }));
      this.app.use(express.urlencoded({ extended: true, limit: '50mb' }));
      
      // Health check endpoint
      this.app.get('/health', async (req, res) => {
        const healthStatus = {
          status: 'ok',
          timestamp: new Date().toISOString(),
          services: {
            mongodb: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
            redis: redisStreamService.isConnected ? 'connected' : 'disconnected',
            workers: this.workerManager ? 'running' : 'not_running'
          },
          uptime: process.uptime(),
          memory: process.memoryUsage(),
          environment: process.env.NODE_ENV || 'development'
        };
        
        // Check worker status if available
        if (this.workerManager) {
          try {
            const workerStatus = await this.workerManager.getStatus();
            healthStatus.workers = workerStatus;
          } catch (error) {
            healthStatus.services.workers = 'error';
            healthStatus.workerError = error.message;
          }
        }
        
        const overallStatus = Object.values(healthStatus.services).every(status => 
          status === 'connected' || status === 'running'
        ) ? 'healthy' : 'unhealthy';
        
        healthStatus.status = overallStatus;
        
        res.status(overallStatus === 'healthy' ? 200 : 503).json(healthStatus);
      });
      
      // Metrics endpoint
      this.app.get('/metrics', async (req, res) => {
        try {
          const metrics = {
            timestamp: new Date().toISOString(),
            redis: {
              connected: redisStreamService.isConnected,
              streams: {}
            },
            workers: {}
          };
          
          // Get Redis stream metrics
          if (redisStreamService.isConnected) {
            const streamNames = Object.values(redisStreamService.streams);
            for (const streamName of streamNames) {
              try {
                const length = await redisStreamService.getStreamLength(streamName);
                metrics.redis.streams[streamName] = { length };
              } catch (error) {
                metrics.redis.streams[streamName] = { error: error.message };
              }
            }
          }
          
          // Get worker metrics
          if (this.workerManager) {
            try {
              const workerStatus = await this.workerManager.getStatus();
              metrics.workers = workerStatus;
            } catch (error) {
              metrics.workers = { error: error.message };
            }
          }
          
          res.json(metrics);
        } catch (error) {
          res.status(500).json({
            error: 'Failed to collect metrics',
            message: error.message
          });
        }
      });
      
      // API routes
      this.app.use('/api/auth', authRoutes);
      this.app.use('/api/statements', statementRoutes);
      
      // Error handling middleware
      this.app.use((err, req, res, next) => {
        logger.error('Express error:', err);
        res.status(err.status || 500).json({
          error: err.message || 'Internal server error',
          ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
        });
      });
      
      // 404 handler
      this.app.use((req, res) => {
        res.status(404).json({
          error: 'Route not found',
          path: req.path,
          method: req.method
        });
      });
      
      logger.info('✅ Express application configured successfully');
      
    } catch (error) {
      logger.error('❌ Failed to setup Express application:', error);
      throw error;
    }
  }

  async initializeRedisStreams() {
    try {
      logger.info('🔴 Initializing Redis Streams...');
      
      // Connect to Redis
      await redisStreamService.connect();
      
      // Initialize all streams and consumer groups
      await redisStreamService.initializeStreams();
      
      logger.info('✅ Redis Streams initialized successfully');
      
    } catch (error) {
      logger.error('❌ Failed to initialize Redis Streams:', error);
      throw error;
    }
  }

  async startWorkers() {
    try {
      logger.info('👷 Starting workers...');
      
      this.workerManager = new WorkerManager({
        enableClustering: this.config.enableClustering,
        maxWorkers: this.config.maxWorkers,
        workerConfig: this.config.workerConfig
      });
      
      await this.workerManager.start();
      
      logger.info('✅ Workers started successfully');
      
    } catch (error) {
      logger.error('❌ Failed to start workers:', error);
      throw error;
    }
  }

  async startServer() {
    return new Promise((resolve, reject) => {
      try {
        this.server = this.app.listen(this.config.port, () => {
          logger.info(`✅ Server listening on port ${this.config.port}`);
          resolve();
        });
        
        this.server.on('error', (error) => {
          logger.error('Server error:', error);
          reject(error);
        });
        
      } catch (error) {
        reject(error);
      }
    });
  }

  async gracefulShutdown(signal) {
    if (this.isShuttingDown) {
      logger.warn('Shutdown already in progress...');
      return;
    }
    
    this.isShuttingDown = true;
    logger.info(`📶 Received ${signal}. Starting graceful shutdown...`);
    
    try {
      // Stop accepting new connections
      if (this.server) {
        logger.info('🌐 Closing HTTP server...');
        await new Promise(resolve => {
          this.server.close(resolve);
        });
        logger.info('✅ HTTP server closed');
      }
      
      // Stop workers
      if (this.workerManager) {
        logger.info('👷 Stopping workers...');
        await this.workerManager.stop();
        logger.info('✅ Workers stopped');
      }
      
      // Disconnect from Redis
      if (redisStreamService.isConnected) {
        logger.info('🔴 Disconnecting from Redis...');
        await redisStreamService.disconnect();
        logger.info('✅ Redis disconnected');
      }
      
      // Close MongoDB connection
      if (mongoose.connection.readyState === 1) {
        logger.info('📊 Closing MongoDB connection...');
        await mongoose.connection.close();
        logger.info('✅ MongoDB disconnected');
      }
      
      logger.info('🎉 Graceful shutdown completed');
      process.exit(0);
      
    } catch (error) {
      logger.error('💥 Error during shutdown:', error);
      process.exit(1);
    }
  }

  handleUncaughtException(error) {
    logger.error('💥 Uncaught Exception:', error);
    this.gracefulShutdown('UNCAUGHT_EXCEPTION');
  }

  handleUnhandledRejection(reason, promise) {
    logger.error('💥 Unhandled Rejection at:', promise, 'reason:', reason);
    this.gracefulShutdown('UNHANDLED_REJECTION');
  }
}

// Start the application
const app = new BankStatementAnalyzerApp();

app.start().catch((error) => {
  logger.error('💥 Failed to start application:', error);
  process.exit(1);
});

export default BankStatementAnalyzerApp;
