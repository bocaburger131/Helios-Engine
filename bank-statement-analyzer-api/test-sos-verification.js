/**
 * SOS Verification Service Test
 * 
 * Test script to demonstrate the SOS verification functionality
 */

import SosVerificationService from './src/services/sosVerificationService.js';
import logger from './src/utils/logger.js';
import { promises as fs } from 'fs';

async function testSosVerification() {
    console.log('🧪 Testing SOS Verification Service');
    console.log('=====================================\n');
    
    let service;
    
    try {
        // Ensure screenshots directory exists
        await fs.mkdir('screenshots', { recursive: true });
        
        // Initialize service
        console.log('📋 Step 1: Initializing SOS Verification Service...');
        service = new SosVerificationService({
            redisConfig: {
                host: 'localhost',
                port: 6379
            },
            queueName: 'test-sos-queue'
        });
        
        console.log('✅ Service initialized successfully\n');
        
        // Test business verification
        console.log('📋 Step 2: Testing business verification...');
        
        const testBusinesses = [
            {
                businessName: 'Apple Inc.',
                state: 'California',
                description: 'Should find active tech company'
            },
            {
                businessName: 'Google LLC',
                state: 'California', 
                description: 'Should find active tech company'
            },
            {
                businessName: 'NonExistentBusiness12345',
                state: 'California',
                description: 'Should not find this business'
            }
        ];
        
        console.log(`🔍 Testing ${testBusinesses.length} businesses:\n`);
        
        for (const business of testBusinesses) {
            console.log(`   Testing: ${business.businessName}`);
            console.log(`   Expected: ${business.description}`);
            
            try {
                const result = await service.verifyBusiness({
                    businessName: business.businessName,
                    state: business.state,
                    jobId: `test-${Date.now()}`
                });
                
                console.log('   Result:', {
                    found: result.found,
                    status: result.status,
                    isActive: result.isActive,
                    registrationDate: result.registrationDate
                });
                
                if (result.success) {
                    console.log('   ✅ Verification completed successfully');
                } else {
                    console.log('   ❌ Verification failed:', result.error);
                }
                
            } catch (error) {
                console.log('   💥 Test failed:', error.message);
            }
            
            console.log('   ---');
            
            // Wait between tests to be respectful
            await new Promise(resolve => setTimeout(resolve, 3000));
        }
        
        console.log('\n📋 Step 3: Testing Redis queue functionality...');
        
        // Test adding jobs to queue
        const jobId1 = await service.addVerificationJob('Test Company 1', 'California');
        const jobId2 = await service.addVerificationJob('Test Company 2', 'California');
        
        console.log(`✅ Added jobs to queue: ${jobId1}, ${jobId2}`);
        
        // Check queue status
        const queueStatus = await service.getQueueStatus();
        console.log('📊 Queue status:', queueStatus);
        
        console.log('\n🎉 All tests completed successfully!');
        
    } catch (error) {
        console.error('\n💥 Test failed:', error);
    } finally {
        if (service) {
            await service.cleanup();
        }
    }
}

async function testApiEndpoints() {
    console.log('\n🌐 Testing API Endpoints');
    console.log('=========================\n');
    
    const baseUrl = 'http://localhost:3001/api/sos';
    
    try {
        // Test health endpoint
        console.log('📋 Testing health endpoint...');
        const healthResponse = await fetch(`${baseUrl}/health`);
        const healthData = await healthResponse.json();
        console.log('Health check result:', healthData);
        
        // Test verification submission
        console.log('\n📋 Testing verification submission...');
        const verifyResponse = await fetch(`${baseUrl}/verify`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                businessName: 'Apple Inc.',
                state: 'California'
            })
        });
        
        const verifyData = await verifyResponse.json();
        console.log('Verification submission result:', verifyData);
        
        if (verifyData.jobId) {
            console.log('\n📋 Waiting and checking result...');
            
            // Wait a bit and check result
            await new Promise(resolve => setTimeout(resolve, 5000));
            
            const resultResponse = await fetch(`${baseUrl}/verify/${verifyData.jobId}`);
            const resultData = await resultResponse.json();
            console.log('Verification result:', resultData);
        }
        
        // Test status endpoint
        console.log('\n📋 Testing status endpoint...');
        const statusResponse = await fetch(`${baseUrl}/status`);
        const statusData = await statusResponse.json();
        console.log('Status result:', statusData);
        
    } catch (error) {
        console.error('API test error:', error.message);
        console.log('💡 Make sure the server is running: npm run dev');
    }
}

// Usage examples and documentation
function showUsageExamples() {
    console.log('\n📖 Usage Examples');
    console.log('==================\n');
    
    console.log('1. Start the worker:');
    console.log('   node workers/sosVerificationWorker.js\n');
    
    console.log('2. Submit verification via API:');
    console.log('   POST /api/sos/verify');
    console.log('   {');
    console.log('     "businessName": "Apple Inc.",');
    console.log('     "state": "California"');
    console.log('   }\n');
    
    console.log('3. Check result:');
    console.log('   GET /api/sos/verify/{jobId}\n');
    
    console.log('4. Synchronous verification:');
    console.log('   POST /api/sos/verify-sync');
    console.log('   {');
    console.log('     "businessName": "Google LLC",');
    console.log('     "state": "California"');
    console.log('   }\n');
    
    console.log('5. Bulk verification:');
    console.log('   POST /api/sos/verify-bulk');
    console.log('   {');
    console.log('     "businesses": [');
    console.log('       { "businessName": "Apple Inc.", "state": "California" },');
    console.log('       { "businessName": "Google LLC", "state": "California" }');
    console.log('     ]');
    console.log('   }\n');
    
    console.log('6. Check service status:');
    console.log('   GET /api/sos/status\n');
    
    console.log('7. Health check:');
    console.log('   GET /api/sos/health\n');
}

// Main execution
async function main() {
    const args = process.argv.slice(2);
    
    if (args.includes('--api-only')) {
        await testApiEndpoints();
    } else if (args.includes('--examples-only')) {
        showUsageExamples();
    } else {
        await testSosVerification();
        showUsageExamples();
        
        if (args.includes('--test-api')) {
            await testApiEndpoints();
        }
    }
}

// Run if executed directly
if (process.argv[1] === new URL(import.meta.url).pathname) {
    main().catch(error => {
        console.error('💥 Test script failed:', error);
        process.exit(1);
    });
}

export {
    testSosVerification,
    testApiEndpoints,
    showUsageExamples
};
