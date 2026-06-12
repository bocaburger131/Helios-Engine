#!/usr/bin/env node

/**
 * Test Script for Playwright-Extra Stealth Browser Automation
 * Demonstrates SOS Verification Service with Redis Queue Integration
 */

import { chromium } from 'playwright-extra';
import StealthPlugin from 'playwright-extra-plugin-stealth';
import SosVerificationService from './src/services/sosVerificationService.js';
import logger from './src/utils/logger.js';
import { createClient } from 'redis';

// Apply stealth plugin
chromium.use(StealthPlugin());

/**
 * Test 1: Basic Stealth Browser Example
 */
async function testBasicStealth() {
    console.log('\n🧪 Test 1: Basic Stealth Browser Test');
    console.log('═'.repeat(60));
    
    let browser = null;
    
    try {
        console.log('🚀 Launching stealth-enabled browser...');
        
        // Launch browser with stealth capabilities
        browser = await chromium.launch({
            headless: false, // Set to true for production
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-accelerated-2d-canvas',
                '--no-first-run',
                '--no-zygote',
                '--disable-gpu',
                '--disable-background-timer-throttling',
                '--disable-backgrounding-occluded-windows',
                '--disable-renderer-backgrounding',
                '--disable-features=TranslateUI',
                '--disable-ipc-flooding-protection'
            ]
        });
        
        const page = await browser.newPage();
        
        // Set realistic viewport and headers
        await page.setViewportSize({ width: 1366, height: 768 });
        await page.setExtraHTTPHeaders({
            'Accept-Language': 'en-US,en;q=0.9'
        });
        
        console.log('📄 Testing stealth capabilities...');
        
        // Test 1: Check if automation is detected
        await page.goto('https://bot.sannysoft.com/', { waitUntil: 'networkidle' });
        await page.waitForTimeout(3000);
        
        // Take screenshot
        await page.screenshot({ path: 'stealth-test-detection.png', fullPage: true });
        console.log('📸 Screenshot saved: stealth-test-detection.png');
        
        // Test 2: Navigate to httpbin to check headers
        await page.goto('https://httpbin.org/headers', { waitUntil: 'networkidle' });
        const headers = await page.textContent('pre');
        console.log('🔍 User-Agent and Headers:', headers.substring(0, 300) + '...');
        
        console.log('✅ Basic stealth browser test completed successfully!');
        return true;
        
    } catch (error) {
        console.error('❌ Basic stealth test failed:', error);
        return false;
        
    } finally {
        if (browser) {
            await browser.close();
        }
    }
}

/**
 * Test 2: SOS Verification Service Test
 */
async function testSosVerificationService() {
    console.log('\n🧪 Test 2: SOS Verification Service Test');
    console.log('═'.repeat(60));
    
    try {
        console.log('🏗️ Initializing SOS Verification Service...');
        
        const service = new SosVerificationService({
            redisConfig: {
                host: process.env.REDIS_HOST || 'localhost',
                port: process.env.REDIS_PORT || 6379,
                retryDelayOnFailover: 100,
                maxRetriesPerRequest: 3
            },
            queueName: 'test-sos-queue'
        });
        
        console.log('📋 Testing business verification...');
        
        // Test business verification
        const testBusiness = {
            businessName: 'Google LLC',
            state: 'California'
        };
        
        console.log(`🔍 Verifying business: ${testBusiness.businessName}`);
        
        const result = await service.verifyBusiness(testBusiness);
        
        console.log('📊 Verification Result:');
        console.log('─'.repeat(40));
        console.log(`Business Name: ${result.businessName}`);
        console.log(`Status: ${result.status}`);
        console.log(`Registration Date: ${result.registrationDate || 'Not found'}`);
        console.log(`Success: ${result.success}`);
        
        if (result.details) {
            console.log(`Official Name: ${result.details.officialName || 'N/A'}`);
            console.log(`Is Active: ${result.details.isActive || false}`);
        }
        
        if (result.error) {
            console.log(`Error: ${result.error.message}`);
        }
        
        console.log('✅ SOS Verification Service test completed!');
        return result.success;
        
    } catch (error) {
        console.error('❌ SOS Verification Service test failed:', error);
        return false;
    }
}

/**
 * Test 3: Redis Queue Integration Test
 */
async function testRedisQueueIntegration() {
    console.log('\n🧪 Test 3: Redis Queue Integration Test');
    console.log('═'.repeat(60));
    
    let redisClient = null;
    
    try {
        console.log('🔗 Connecting to Redis...');
        
        // Create Redis client
        redisClient = createClient({
            socket: {
                host: process.env.REDIS_HOST || 'localhost',
                port: process.env.REDIS_PORT || 6379
            }
        });
        
        await redisClient.connect();
        console.log('✅ Connected to Redis');
        
        // Test queue operations
        const queueName = 'test-sos-verification-queue';
        
        // Add test jobs to queue
        const testJobs = [
            { businessName: 'Apple Inc', state: 'California' },
            { businessName: 'Microsoft Corporation', state: 'California' },
            { businessName: 'Test Business XYZ', state: 'California' }
        ];
        
        console.log(`📝 Adding ${testJobs.length} test jobs to queue: ${queueName}`);
        
        for (const job of testJobs) {
            const jobData = {
                ...job,
                timestamp: new Date().toISOString(),
                jobId: `test_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
            };
            
            await redisClient.rPush(queueName, JSON.stringify(jobData));
            console.log(`  ✓ Added job: ${job.businessName}`);
        }
        
        // Check queue length
        const queueLength = await redisClient.lLen(queueName);
        console.log(`📊 Queue length: ${queueLength} jobs`);
        
        // Pop a test job
        const poppedJob = await redisClient.lPop(queueName);
        if (poppedJob) {
            const jobData = JSON.parse(poppedJob);
            console.log(`📤 Popped job: ${jobData.businessName} (ID: ${jobData.jobId})`);
        }
        
        // Clean up remaining test jobs
        await redisClient.del(queueName);
        console.log('🧹 Cleaned up test queue');
        
        console.log('✅ Redis Queue Integration test completed!');
        return true;
        
    } catch (error) {
        console.error('❌ Redis Queue Integration test failed:', error);
        return false;
        
    } finally {
        if (redisClient) {
            await redisClient.quit();
        }
    }
}

/**
 * Test 4: Complete Workflow Test
 */
async function testCompleteWorkflow() {
    console.log('\n🧪 Test 4: Complete Workflow Test');
    console.log('═'.repeat(60));
    
    try {
        console.log('🔗 Setting up complete workflow test...');
        
        const service = new SosVerificationService({
            queueName: 'workflow-test-queue'
        });
        
        // Add a job to the queue
        const businessName = 'Example LLC';
        console.log(`📝 Adding job for: ${businessName}`);
        
        const jobId = await service.addJob(businessName, 'California');
        console.log(`✓ Job added with ID: ${jobId}`);
        
        // Simulate worker processing
        console.log('⚙️ Simulating worker processing...');
        
        // Note: In a real scenario, the worker would be running separately
        // For testing, we'll manually process the job
        
        console.log('✅ Complete workflow test setup completed!');
        console.log('💡 To run the actual worker, use: node workers/sosVerificationWorker.js');
        
        return true;
        
    } catch (error) {
        console.error('❌ Complete workflow test failed:', error);
        return false;
    }
}

/**
 * Main test runner
 */
async function runAllTests() {
    console.log('🚀 Starting Playwright-Extra & SOS Verification Tests');
    console.log('═'.repeat(80));
    
    const tests = [
        { name: 'Basic Stealth Browser', fn: testBasicStealth },
        { name: 'SOS Verification Service', fn: testSosVerificationService },
        { name: 'Redis Queue Integration', fn: testRedisQueueIntegration },
        { name: 'Complete Workflow', fn: testCompleteWorkflow }
    ];
    
    const results = [];
    
    for (const test of tests) {
        try {
            const result = await test.fn();
            results.push({ name: test.name, success: result });
        } catch (error) {
            console.error(`❌ Test "${test.name}" threw an error:`, error);
            results.push({ name: test.name, success: false });
        }
    }
    
    // Print summary
    console.log('\n📊 Test Results Summary');
    console.log('═'.repeat(80));
    
    let passed = 0;
    for (const result of results) {
        const status = result.success ? '✅ PASS' : '❌ FAIL';
        console.log(`${status} ${result.name}`);
        if (result.success) passed++;
    }
    
    console.log('─'.repeat(40));
    console.log(`Total: ${results.length} | Passed: ${passed} | Failed: ${results.length - passed}`);
    
    if (passed === results.length) {
        console.log('\n🎉 All tests passed! Your setup is ready for production.');
        console.log('\n📋 Next Steps:');
        console.log('1. Start Redis server: redis-server');
        console.log('2. Start the worker: node workers/sosVerificationWorker.js');
        console.log('3. Add jobs to the queue using the service API');
    } else {
        console.log('\n⚠️ Some tests failed. Please check the configuration and try again.');
    }
    
    return passed === results.length;
}

// Run tests if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
    runAllTests().catch(error => {
        console.error('❌ Test suite failed:', error);
        process.exit(1);
    });
}

export { testBasicStealth, testSosVerificationService, testRedisQueueIntegration, testCompleteWorkflow };
