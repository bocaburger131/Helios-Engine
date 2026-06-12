/**
 * SOS Verification Demo
 * 
 * Complete demonstration of the SOS verification workflow
 */

import SosVerificationService from './src/services/sosVerificationService.js';

async function demonstrateSosWorkflow() {
    console.log('🏛️  SOS Verification Service Demo');
    console.log('=================================\n');
    
    const service = new SosVerificationService({
        redisConfig: {
            host: 'localhost',
            port: 6379
        }
    });
    
    try {
        console.log('📋 Step 1: Adding verification jobs to queue...');
        
        // Add some test jobs
        const testBusinesses = [
            { name: 'Apple Inc.', state: 'California' },
            { name: 'Google LLC', state: 'California' },
            { name: 'Fake Business 12345', state: 'California' }
        ];
        
        const jobIds = [];
        for (const business of testBusinesses) {
            const jobId = await service.addVerificationJob(business.name, business.state);
            jobIds.push({ jobId, business });
            console.log(`   ✅ Added job ${jobId} for ${business.name}`);
        }
        
        console.log('\n📊 Step 2: Checking queue status...');
        const status = await service.getQueueStatus();
        console.log(`   Queue length: ${status.queueLength}`);
        console.log(`   Active results: ${status.activeResults}`);
        console.log(`   Processing: ${status.isProcessing}`);
        
        console.log('\n🔍 Step 3: Simulating verification process...');
        console.log('   (In production, the worker would process these automatically)');
        
        // Simulate processing one job
        if (jobIds.length > 0) {
            const testJob = jobIds[0];
            console.log(`   Processing: ${testJob.business.name}`);
            
            try {
                // This would normally be done by the worker
                const result = await service.verifyBusiness({
                    businessName: testJob.business.name,
                    state: testJob.business.state,
                    jobId: testJob.jobId
                });
                
                console.log('   ✅ Verification completed:');
                console.log(`     Found: ${result.found}`);
                console.log(`     Status: ${result.status}`);
                console.log(`     Active: ${result.isActive}`);
                console.log(`     Registration Date: ${result.registrationDate}`);
                
            } catch (error) {
                console.log(`   ❌ Verification failed: ${error.message}`);
                console.log('   💡 This is expected if Chrome/Playwright is not properly set up');
            }
        }
        
        console.log('\n📋 Step 4: Queue management...');
        
        // Show how to check results
        for (const job of jobIds) {
            const result = await service.getVerificationResult(job.jobId);
            if (result) {
                console.log(`   ✅ Result found for ${job.business.name}: ${result.status}`);
            } else {
                console.log(`   ⏳ No result yet for ${job.business.name}`);
            }
        }
        
        console.log('\n🎯 Production Workflow:');
        console.log('======================');
        console.log('1. Start worker: npm run sos:worker');
        console.log('2. Worker continuously monitors Redis queue');
        console.log('3. Submit jobs via API: POST /api/sos/verify');
        console.log('4. Worker processes jobs automatically');
        console.log('5. Retrieve results: GET /api/sos/verify/{jobId}');
        console.log('6. Results cached in Redis for 1 hour');
        
        console.log('\n📚 API Examples:');
        console.log('================');
        
        console.log('\n# Submit verification:');
        console.log('curl -X POST http://localhost:3001/api/sos/verify \\');
        console.log('  -H "Content-Type: application/json" \\');
        console.log('  -d \'{"businessName": "Apple Inc.", "state": "California"}\'');
        
        console.log('\n# Check result:');
        console.log('curl http://localhost:3001/api/sos/verify/{jobId}');
        
        console.log('\n# Health check:');
        console.log('curl http://localhost:3001/api/sos/health');
        
        console.log('\n# Queue status:');
        console.log('curl http://localhost:3001/api/sos/status');
        
        console.log('\n✨ Features:');
        console.log('============');
        console.log('• Browser automation with Playwright');
        console.log('• Stealth mode to avoid detection');
        console.log('• DiaBrowser integration support');
        console.log('• Redis-based job queue');
        console.log('• RESTful API endpoints');
        console.log('• Bulk verification support');
        console.log('• Rate limiting and error handling');
        console.log('• Screenshot debugging');
        console.log('• Comprehensive logging');
        
        console.log('\n🚀 Getting Started:');
        console.log('===================');
        console.log('1. Ensure Redis is running: redis-server');
        console.log('2. Start the worker: npm run sos:worker');
        console.log('3. Start the API: npm run dev');
        console.log('4. Submit verification requests to /api/sos/verify');
        console.log('5. Monitor with /api/sos/status');
        
    } catch (error) {
        console.error('❌ Demo failed:', error.message);
    } finally {
        await service.cleanup();
        console.log('\n🧹 Demo cleanup completed');
    }
}

// Run demo
demonstrateSosWorkflow()
    .then(() => {
        console.log('\n🎉 SOS Verification Demo completed!');
        console.log('📖 See SOS_VERIFICATION_README.md for full documentation');
        process.exit(0);
    })
    .catch(error => {
        console.error('💥 Demo failed:', error);
        process.exit(1);
    });
