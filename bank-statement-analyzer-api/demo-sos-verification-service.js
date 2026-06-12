/**
 * SOS Verification Service Demo
 * 
 * Demonstrates how to use the existing SosVerificationService for business verification
 * through the California Secretary of State website with Redis queue integration.
 */

import SosVerificationService from './src/services/sosVerificationService.js';
import logger from './src/utils/logger.js';

console.log('🏛️ SOS Verification Service Demo');
console.log('=' * 60);

async function demonstrateSosVerification() {
  let sosService = null;

  try {
    console.log('\n📋 SOS Verification Service Overview:');
    console.log('-------------------------------------');
    console.log('✅ Browser automation with Playwright-Extra + stealth plugin');
    console.log('✅ Redis queue integration for job processing');
    console.log('✅ DiaBrowser support for enhanced stealth');
    console.log('✅ California Secretary of State website scraping');
    console.log('✅ Business status and registration date extraction');
    console.log('✅ Comprehensive error handling and retry logic');

    console.log('\n🚀 Initializing SOS Verification Service...');
    
    // Initialize the service
    sosService = new SosVerificationService({
      redisConfig: {
        host: process.env.REDIS_HOST || 'localhost',
        port: process.env.REDIS_PORT || 6379,
        // Optional password if Redis requires authentication
        password: process.env.REDIS_PASSWORD || null
      },
      queueName: 'sos-verification-demo',
      // Optional DiaBrowser path (if installed)
      diaBrowserPath: process.env.DIABROWSER_PATH || 'C:\\Program Files\\DiaBrowser\\DiaBrowser.exe'
    });

    console.log('✅ SOS Verification Service initialized');

    console.log('\n📊 Current Queue Status:');
    const queueStatus = await sosService.getQueueStatus();
    console.log(`   Queue Length: ${queueStatus.queueLength}`);
    console.log(`   Active Results: ${queueStatus.activeResults}`);
    console.log(`   Is Processing: ${queueStatus.isProcessing}`);

    console.log('\n🔍 Example Usage - Adding Verification Jobs:');
    console.log('--------------------------------------------');
    
    // Example 1: Add a verification job for a real business
    const jobId1 = await sosService.addVerificationJob(
      'Apple Inc',
      'california'
    );
    console.log(`✅ Job 1 queued: ${jobId1} (Apple Inc)`);

    // Example 2: Add a verification job for another business
    const jobId2 = await sosService.addVerificationJob(
      'Google LLC',
      'california'
    );
    console.log(`✅ Job 2 queued: ${jobId2} (Google LLC)`);

    // Example 3: Add a verification job for a non-existent business
    const jobId3 = await sosService.addVerificationJob(
      'Fake Business Name 12345',
      'california'
    );
    console.log(`✅ Job 3 queued: ${jobId3} (Fake Business Name 12345)`);

    console.log('\n📈 Updated Queue Status:');
    const updatedStatus = await sosService.getQueueStatus();
    console.log(`   Queue Length: ${updatedStatus.queueLength}`);

    console.log('\n🤖 How the Service Works:');
    console.log('-------------------------');
    console.log('1. 📝 Jobs are added to Redis queue with business name and state');
    console.log('2. 🔄 Worker continuously polls Redis queue for new jobs');
    console.log('3. 🌐 For each job, launches browser with stealth configuration');
    console.log('4. 🔍 Navigates to California SOS business search website');
    console.log('5. ⌨️  Enters business name and submits search form');
    console.log('6. 📊 Scrapes results to find business status and registration date');
    console.log('7. 💾 Stores results back in Redis with job ID for retrieval');
    console.log('8. 🧹 Cleans up browser resources after each job');

    console.log('\n🏗️ Service Architecture:');
    console.log('------------------------');
    console.log('📦 Components:');
    console.log('   • Redis Queue: Job management and result storage');
    console.log('   • Playwright-Extra: Browser automation with stealth');
    console.log('   • StealthPlugin: Anti-detection capabilities');
    console.log('   • DiaBrowser Integration: Enhanced stealth browser');
    console.log('   • Logger: Comprehensive logging and monitoring');

    console.log('\n🔧 Key Methods Available:');
    console.log('-------------------------');
    console.log('• startWorker() - Start processing jobs from queue');
    console.log('• addVerificationJob(name, state, jobId) - Add job to queue');
    console.log('• getVerificationResult(jobId) - Get result by job ID');
    console.log('• verifyBusiness(jobData) - Direct verification (bypass queue)');
    console.log('• getQueueStatus() - Check queue and processing status');
    console.log('• cleanup() - Clean up resources');

    console.log('\n📄 Job Structure:');
    console.log('-----------------');
    console.log('Input Job:');
    console.log('  {');
    console.log('    "jobId": "sos-1234567890-abc123",');
    console.log('    "businessName": "Apple Inc",');
    console.log('    "state": "california",');
    console.log('    "timestamp": "2024-01-15T10:30:00.000Z"');
    console.log('  }');

    console.log('\n📋 Result Structure:');
    console.log('--------------------');
    console.log('Success Result:');
    console.log('  {');
    console.log('    "success": true,');
    console.log('    "jobId": "sos-1234567890-abc123",');
    console.log('    "businessName": "Apple Inc",');
    console.log('    "state": "california",');
    console.log('    "found": true,');
    console.log('    "status": "ACTIVE",');
    console.log('    "registrationDate": "1977-01-03",');
    console.log('    "isActive": true,');
    console.log('    "matchedBusinessName": "APPLE INC.",');
    console.log('    "timestamp": "2024-01-15T10:35:00.000Z"');
    console.log('  }');

    console.log('\n🔄 Starting Worker Example (commented out for demo):');
    console.log('----------------------------------------------------');
    console.log('// To start processing jobs continuously:');
    console.log('// await sosService.startWorker();');
    console.log('// This will continuously process jobs from the Redis queue');

    console.log('\n💡 Direct Verification Example:');
    console.log('-------------------------------');
    console.log('// For immediate verification without queue:');
    console.log('const result = await sosService.verifyBusiness({');
    console.log('  businessName: "Apple Inc",');
    console.log('  state: "california",');
    console.log('  jobId: "direct-verification-001"');
    console.log('});');

    console.log('\n🎯 Real-World Integration:');
    console.log('--------------------------');
    console.log('1. 🔧 Initialize service in your application startup');
    console.log('2. 🚀 Start worker process to handle queue jobs');
    console.log('3. 📝 Add verification jobs via API endpoints');
    console.log('4. 📊 Poll for results or use Redis pub/sub for real-time updates');
    console.log('5. 🔄 Implement retry logic for failed verifications');
    console.log('6. 📈 Monitor queue length and processing performance');

    console.log('\n⚙️ Configuration Options:');
    console.log('-------------------------');
    console.log('Environment Variables:');
    console.log('   • REDIS_HOST - Redis server host');
    console.log('   • REDIS_PORT - Redis server port');
    console.log('   • REDIS_PASSWORD - Redis authentication');
    console.log('   • DIABROWSER_PATH - DiaBrowser executable path');
    console.log('   • NODE_ENV - Environment (affects browser headless mode)');

    console.log('\n🔒 Security Features:');
    console.log('---------------------');
    console.log('✅ Stealth plugin to avoid detection');
    console.log('✅ Random delays to mimic human behavior');
    console.log('✅ User agent spoofing');
    console.log('✅ Browser fingerprint masking');
    console.log('✅ DiaBrowser integration for enhanced stealth');

    console.log('\n📊 Performance Optimizations:');
    console.log('-----------------------------');
    console.log('✅ Browser instance reuse when possible');
    console.log('✅ Connection pooling for DiaBrowser');
    console.log('✅ Efficient DOM selectors for fast scraping');
    console.log('✅ Screenshot capture for debugging');
    console.log('✅ Timeout handling for reliability');

    return {
      serviceInitialized: true,
      queuedJobs: [jobId1, jobId2, jobId3],
      queueStatus: updatedStatus,
      featuresAvailable: [
        'Redis queue integration',
        'Playwright-Extra stealth',
        'DiaBrowser support',
        'California SOS scraping',
        'Business verification',
        'Error handling',
        'Job management'
      ]
    };

  } catch (error) {
    console.error('❌ Demo error:', error);
    return { error: error.message };
  } finally {
    // Clean up service (optional - in real usage, keep service running)
    if (sosService) {
      await sosService.cleanup();
      console.log('\n🧹 Service cleaned up (demo complete)');
    }
  }
}

// Run the demonstration
demonstrateSosVerification()
  .then(result => {
    console.log('\n🎉 SOS Verification Service Demo Complete!');
    console.log('=' * 60);
    if (result.serviceInitialized) {
      console.log('✅ Your SOS Verification Service is ready to use!');
      console.log(`📊 Queued ${result.queuedJobs.length} demo jobs for testing`);
      console.log('\n🚀 Next Steps:');
      console.log('   1. Ensure Redis is running on your system');
      console.log('   2. Install DiaBrowser (optional, for enhanced stealth)');
      console.log('   3. Start the worker: sosService.startWorker()');
      console.log('   4. Monitor job processing and results');
    }
  })
  .catch(error => {
    console.error('❌ Demo failed:', error);
  });
