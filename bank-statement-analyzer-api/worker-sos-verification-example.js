/**
 * SOS Verification Worker Example
 * 
 * Demonstrates how to start the SOS verification worker to process jobs
 * from the Redis queue and perform actual business verifications.
 */

import SosVerificationService from './src/services/sosVerificationService.js';
import logger from './src/utils/logger.js';

console.log('🔄 SOS Verification Worker Example');
console.log('=' * 50);

async function startSosWorker() {
  let sosService = null;

  try {
    console.log('\n🚀 Starting SOS Verification Worker...');

    // Initialize the service with configuration
    sosService = new SosVerificationService({
      redisConfig: {
        host: process.env.REDIS_HOST || 'localhost',
        port: process.env.REDIS_PORT || 6379,
        password: process.env.REDIS_PASSWORD || null
      },
      queueName: 'sos-verification-queue'
    });

    console.log('✅ SOS Verification Service initialized');

    // Check current queue status
    const initialStatus = await sosService.getQueueStatus();
    console.log(`📊 Initial Queue Status: ${initialStatus.queueLength} jobs waiting`);

    // Add some test jobs if queue is empty
    if (initialStatus.queueLength === 0) {
      console.log('\n📝 Adding test jobs to queue...');
      
      const testJobs = [
        { businessName: 'Apple Inc', state: 'california' },
        { businessName: 'Microsoft Corporation', state: 'california' },
        { businessName: 'Meta Platforms Inc', state: 'california' }
      ];

      for (const job of testJobs) {
        const jobId = await sosService.addVerificationJob(job.businessName, job.state);
        console.log(`   ✅ Added: ${job.businessName} (${jobId})`);
      }

      const updatedStatus = await sosService.getQueueStatus();
      console.log(`📊 Updated Queue Status: ${updatedStatus.queueLength} jobs ready`);
    }

    console.log('\n🔄 Worker Process Flow:');
    console.log('1. 👀 Monitor Redis queue for new jobs');
    console.log('2. 🌐 Launch browser with stealth configuration');
    console.log('3. 🔍 Navigate to California SOS website');
    console.log('4. ⌨️  Search for business information');
    console.log('5. 📊 Extract status and registration data');
    console.log('6. 💾 Store results in Redis for retrieval');
    console.log('7. 🧹 Clean up and process next job');

    console.log('\n⚠️  Worker Starting Instructions:');
    console.log('----------------------------------');
    console.log('1. 🔧 Ensure Redis server is running');
    console.log('2. 🌐 Check internet connection for SOS website access');
    console.log('3. 📂 Verify DiaBrowser path (if using enhanced stealth)');
    console.log('4. 🖥️  Set headless mode via NODE_ENV environment');

    console.log('\n🎮 Worker Control Commands:');
    console.log('---------------------------');
    console.log('• Press Ctrl+C to stop worker gracefully');
    console.log('• Monitor logs for job processing status');
    console.log('• Check Redis keys for stored results');

    console.log('\n🚀 Starting Worker (Comment out for demo)...');
    console.log('------------------------------------------------');
    console.log('// Uncomment the following line to start actual processing:');
    console.log('// await sosService.startWorker();');
    
    // For demonstration, we'll simulate a few job processes
    console.log('\n🎯 Simulating Job Processing (Demo Mode):');
    console.log('-----------------------------------------');
    
    // Example of direct verification (bypassing queue for demo)
    const demoJob = {
      businessName: 'Apple Inc',
      state: 'california',
      jobId: 'demo-verification-001'
    };

    console.log(`🔍 Processing demo job: ${demoJob.businessName}`);
    console.log('   (This would normally be processed by the worker)');
    
    // Show what the result structure would look like
    console.log('\n📋 Expected Result Structure:');
    console.log('-----------------------------');
    console.log(JSON.stringify({
      success: true,
      jobId: demoJob.jobId,
      businessName: demoJob.businessName,
      state: demoJob.state,
      found: true,
      status: 'ACTIVE',
      registrationDate: '1977-01-03',
      isActive: true,
      matchedBusinessName: 'APPLE INC.',
      timestamp: new Date().toISOString()
    }, null, 2));

    console.log('\n💡 Production Worker Setup:');
    console.log('----------------------------');
    console.log('1. Create dedicated worker process/container');
    console.log('2. Configure environment variables for Redis connection');
    console.log('3. Set up process monitoring and restart policies');
    console.log('4. Implement health checks and alerting');
    console.log('5. Scale workers based on queue length');

    console.log('\n📊 Monitoring & Maintenance:');
    console.log('----------------------------');
    console.log('• Monitor queue length: sosService.getQueueStatus()');
    console.log('• Check processing performance and success rates');
    console.log('• Clean up old results from Redis periodically');
    console.log('• Monitor browser process health and memory usage');
    console.log('• Log business verification success/failure rates');

    return {
      workerReady: true,
      queueStatus: await sosService.getQueueStatus(),
      demoJobProcessed: true
    };

  } catch (error) {
    console.error('❌ Worker startup error:', error);
    return { error: error.message };
  } finally {
    if (sosService) {
      await sosService.cleanup();
      console.log('\n🧹 Demo cleanup completed');
    }
  }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Received SIGINT, shutting down gracefully...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n🛑 Received SIGTERM, shutting down gracefully...');
  process.exit(0);
});

// Run the worker demonstration
startSosWorker()
  .then(result => {
    console.log('\n🎉 SOS Worker Demo Complete!');
    console.log('=' * 50);
    if (result.workerReady) {
      console.log('✅ Worker is ready to process jobs!');
      console.log('\n🔧 To start actual processing:');
      console.log('1. Uncomment: await sosService.startWorker()');
      console.log('2. Ensure Redis is running');
      console.log('3. Add jobs to queue via API or directly');
      console.log('4. Monitor results and processing logs');
    }
  })
  .catch(error => {
    console.error('❌ Worker demo failed:', error);
  });

// Export for potential use in other modules
export { startSosWorker };
