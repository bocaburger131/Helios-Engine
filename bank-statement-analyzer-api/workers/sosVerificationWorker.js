/**
 * SOS Verification Worker - Enhanced with Playwright-Extra Stealth
 * 
 * This worker script runs the SOS Verification Service to process
 * business verification jobs from Redis queue using stealth browser automation.
 */

import SosVerificationService from '../src/services/sosVerificationService.js';
import logger from '../src/utils/logger.js';
import { promises as fs } from 'fs';

class SosWorker {
    constructor() {
        this.service = null;
        this.isShuttingDown = false;
    }

    async initialize() {
        logger.info('🚀 Initializing SOS Verification Worker...');
        
        try {
            // Ensure screenshots directory exists
            await fs.mkdir('screenshots', { recursive: true });
            
            // Initialize the service
            this.service = new SosVerificationService({
                redisConfig: {
                    host: process.env.REDIS_HOST || 'localhost',
                    port: process.env.REDIS_PORT || 6379,
                    password: process.env.REDIS_PASSWORD || null
                },
                queueName: 'sos-verification-queue',
                diaBrowserPath: process.env.DIABROWSER_PATH || 'C:\\Program Files\\DiaBrowser\\DiaBrowser.exe'
            });
            
            // Setup graceful shutdown handlers
            this.setupShutdownHandlers();
            
            logger.info('✅ SOS Verification Worker initialized successfully');
            
        } catch (error) {
            logger.error('❌ Failed to initialize worker:', error);
            throw error;
        }
    }

    async start() {
        if (!this.service) {
            throw new Error('Worker not initialized. Call initialize() first.');
        }
        
        logger.info('🎯 Starting SOS Verification Worker...');
        
        try {
            await this.service.startWorker();
        } catch (error) {
            logger.error('💥 Worker crashed:', error);
            await this.shutdown();
            throw error;
        }
    }

    setupShutdownHandlers() {
        // Handle CTRL+C
        process.on('SIGINT', async () => {
            logger.info('📋 Received SIGINT, shutting down gracefully...');
            await this.shutdown();
        });

        // Handle termination
        process.on('SIGTERM', async () => {
            logger.info('📋 Received SIGTERM, shutting down gracefully...');
            await this.shutdown();
        });

        // Handle uncaught exceptions
        process.on('uncaughtException', async (error) => {
            logger.error('💥 Uncaught exception:', error);
            await this.shutdown();
            process.exit(1);
        });

        // Handle unhandled promise rejections
        process.on('unhandledRejection', async (reason, promise) => {
            logger.error('💥 Unhandled rejection at:', promise, 'reason:', reason);
            await this.shutdown();
            process.exit(1);
        });
    }

    async shutdown() {
        if (this.isShuttingDown) return;
        
        this.isShuttingDown = true;
        logger.info('🛑 Shutting down SOS Verification Worker...');
        
        try {
            if (this.service) {
                await this.service.cleanup();
            }
            
            logger.info('✅ Worker shutdown complete');
            process.exit(0);
            
        } catch (error) {
            logger.error('❌ Error during shutdown:', error);
            process.exit(1);
        }
    }
}

// Main execution
async function main() {
    const worker = new SosWorker();
    
    try {
        await worker.initialize();
        await worker.start();
    } catch (error) {
        logger.error('💥 Failed to start SOS Verification Worker:', error);
        process.exit(1);
    }
}

// Run if this file is executed directly
if (process.argv[1] === new URL(import.meta.url).pathname) {
    console.log('🏛️  SOS Verification Worker');
    console.log('============================\n');
    
    main().catch(error => {
        logger.error('💥 Worker startup failed:', error);
        process.exit(1);
    });
}

export default SosWorker;
