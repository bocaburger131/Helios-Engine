/**
 * Test script for the new SOS Verification Service
 * Demonstrates how to use the service for browser automation
 */

import SosVerificationWorkerService from './src/services/SosVerificationWorkerService.js';
import logger from './src/utils/logger.js';

async function testSosVerification() {
    const service = new SosVerificationWorkerService({
        redisHost: 'localhost',
        redisPort: 6379,
        queueName: 'test-sos-queue',
        resultQueueName: 'test-sos-results',
        // diabrowserEndpoint: 'ws://localhost:9222', // Uncomment if using DiaBrowser
        timeout: 30000
    });

    try {
        logger.info('🧪 Starting SOS Verification Test...');
        
        // Initialize the service
        await service.initialize();
        
        // Test Case 1: Add a job to the queue
        logger.info('📤 Adding test job to queue...');
        const jobId = await service.addJob('GOOGLE LLC', 'CA', 'test_google_llc');
        logger.info(`✅ Job added with ID: ${jobId}`);

        // Test Case 2: Process the job directly (without queue)
        logger.info('🔍 Processing verification directly...');
        
        const testJob = {
            jobId: 'direct_test_123',
            businessName: 'MICROSOFT CORPORATION',
            state: 'CA'
        };

        // Launch browser for direct processing
        await service.launchBrowser();
        
        // Process the job
        const result = await service.processVerificationJob(testJob);
        
        logger.info('📋 Verification Result:', {
            jobId: result.jobId,
            found: result.found,
            businessName: result.businessName,
            matchedBusinessName: result.matchedBusinessName,
            status: result.status,
            isActive: result.isActive,
            registrationDate: result.registrationDate
        });

        // Test Case 3: Demonstrate queue processing
        logger.info('⚡ Testing queue-based processing...');
        
        // Add another job
        await service.addJob('APPLE INC', 'CA', 'test_apple_inc');
        
        // Process one job from queue
        const queueResult = await service.processJobFromQueue();
        
        if (queueResult) {
            logger.info('📥 Queue processing result:', {
                jobId: queueResult.jobId,
                found: queueResult.found,
                status: queueResult.status
            });
        } else {
            logger.info('📭 No jobs in queue');
        }

        logger.info('✅ All tests completed successfully!');

    } catch (error) {
        logger.error('❌ Test failed:', error);
    } finally {
        // Cleanup
        await service.cleanup();
        logger.info('🧹 Test cleanup completed');
    }
}

// Worker simulation test
async function testWorkerMode() {
    const service = new SosVerificationWorkerService();
    
    try {
        logger.info('👷 Testing Worker Mode...');
        
        await service.initialize();
        
        // Add a few test jobs
        const testBusinesses = [
            { name: 'TESLA INC', state: 'CA' },
            { name: 'FACEBOOK INC', state: 'CA' },
            { name: 'NETFLIX INC', state: 'CA' }
        ];

        for (const business of testBusinesses) {
            await service.addJob(business.name, business.state);
            logger.info(`📤 Added job for ${business.name}`);
        }

        // Process jobs for a limited time (30 seconds)
        logger.info('⏱️ Processing jobs for 30 seconds...');
        
        const startTime = Date.now();
        const timeout = 30000; // 30 seconds
        
        while (Date.now() - startTime < timeout) {
            const result = await service.processJobFromQueue();
            
            if (result) {
                logger.info(`✅ Processed: ${result.businessName} - Found: ${result.found}`);
            } else {
                logger.info('📭 No more jobs, waiting...');
                await new Promise(resolve => setTimeout(resolve, 2000));
            }
        }

        logger.info('⏰ Worker mode test completed');

    } catch (error) {
        logger.error('❌ Worker mode test failed:', error);
    } finally {
        await service.cleanup();
    }
}

// Main test execution
async function main() {
    const args = process.argv.slice(2);
    
    if (args.includes('--worker-mode')) {
        await testWorkerMode();
    } else {
        await testSosVerification();
    }
}

// Run tests
main().catch(error => {
    logger.error('❌ Test execution failed:', error);
    process.exit(1);
});

export { testSosVerification, testWorkerMode };
