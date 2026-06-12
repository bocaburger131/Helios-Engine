/**
 * SOS Verification Worker Script
 * 
 * Standalone worker process for handling SOS verification jobs
 * (`SosVerificationWorkerService`).
 *
 * Stealth scraping is implemented in `src/services/californiaSosStealthScraper.js`
 * via `playwright-extra` + `puppeteer-extra-plugin-stealth`. Optional env overrides:
 * - `PW_HEADLESS=false` to run headed.
 * - `PW_BROWSER_CHANNEL=chrome` | `chrome-beta` | `msedge` | … (Playwright branded channel).
 */

import SosVerificationWorkerService from '../src/services/SosVerificationWorkerService.js';
import logger from '../src/utils/logger.js';

class SosWorker {
    constructor() {
        this.service = null;
        this.isShuttingDown = false;
    }

    /**
     * Initialize the worker service
     */
    async initialize() {
        try {
            logger.info('🚀 Initializing SOS Verification Worker...');
            
            // Create service instance with configuration
            this.service = new SosVerificationWorkerService({
                redisHost: process.env.REDIS_HOST || 'localhost',
                redisPort: process.env.REDIS_PORT || 6379,
                redisPassword: process.env.REDIS_PASSWORD,
                queueName: process.env.SOS_QUEUE_NAME || 'sos-verification-queue',
                resultQueueName: process.env.SOS_RESULT_QUEUE_NAME || 'sos-verification-results',
                diabrowserEndpoint: process.env.DIABROWSER_ENDPOINT,
                timeout: parseInt(process.env.SOS_TIMEOUT) || 30000
            });

            // Initialize Redis connection
            await this.service.initialize();
            
            // Setup graceful shutdown handlers
            this.setupShutdownHandlers();
            
            logger.info('✅ SOS Verification Worker initialized successfully');
            
        } catch (error) {
            logger.error('❌ Failed to initialize worker:', error);
            throw error;
        }
    }

    /**
     * Start processing jobs from the queue
     */
    async start() {
        if (!this.service) {
            throw new Error('Worker not initialized. Call initialize() first.');
        }
        
        logger.info('🎯 Starting SOS Verification Worker...');
        
        try {
            // Start the worker loop (this will run indefinitely)
            await this.service.startWorker();
            
        } catch (error) {
            logger.error('💥 Worker crashed:', error);
            await this.shutdown();
            throw error;
        }
    }

    /**
     * Setup graceful shutdown handlers
     */
    setupShutdownHandlers() {
        // Handle CTRL+C
        process.on('SIGINT', async () => {
            logger.info('📋 Received SIGINT (Ctrl+C), shutting down gracefully...');
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

    /**
     * Graceful shutdown
     */
    async shutdown() {
        if (this.isShuttingDown) return;
        
        this.isShuttingDown = true;
        logger.info('🛑 Shutting down SOS Verification Worker...');
        
        try {
            if (this.service) {
                await this.service.cleanup();
            }
            
            logger.info('✅ Worker shutdown completed');
            process.exit(0);
            
        } catch (error) {
            logger.error('❌ Error during shutdown:', error);
            process.exit(1);
        }
    }
}

// Helper function to add a test job to the queue
async function addTestJob() {
    const service = new SosVerificationWorkerService();
    
    try {
        await service.initialize();
        
        const jobId = await service.addJob(
            'GOOGLE LLC', 
            'CA',
            `test_job_${Date.now()}`
        );
        
        logger.info(`✅ Test job added with ID: ${jobId}`);
        await service.cleanup();
        
    } catch (error) {
        logger.error('❌ Failed to add test job:', error);
    }
}

// Main execution
async function main() {
    // Check command line arguments
    const args = process.argv.slice(2);
    
    if (args.includes('--add-test-job')) {
        // Add a test job and exit
        await addTestJob();
        return;
    }
    
    // Start the worker
    const worker = new SosWorker();
    
    try {
        await worker.initialize();
        await worker.start();
        
    } catch (error) {
        logger.error('❌ Worker failed to start:', error);
        process.exit(1);
    }
}

// Only run if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
    main().catch((error) => {
        logger.error('❌ Fatal error:', error);
        process.exit(1);
    });
}

export default SosWorker;
