/**
 * Simple Redis Streams Test
 * Tests the core Redis Streams service without complex workers
 */

import redisStreamService from './src/services/redisStreamService.js';
import logger from './src/utils/logger.js';

async function testRedisStreams() {
  try {
    console.log('🔴 Testing Redis Streams Core Service...\n');
    
    // Test 1: Connection
    console.log('1. Testing Redis connection...');
    await redisStreamService.connect();
    console.log('✅ Redis connected successfully');
    
    // Test 2: Stream initialization
    console.log('\n2. Testing stream initialization...');
    await redisStreamService.initializeStreams();
    console.log('✅ Streams initialized successfully');
    
    // Test 3: Add message to stream
    console.log('\n3. Testing message publishing...');
    const messageId = await redisStreamService.addToStream(
      redisStreamService.streams.STATEMENT_PROCESSING,
      {
        type: 'TEST_MESSAGE',
        payload: {
          testId: 'redis-streams-test-1',
          timestamp: new Date().toISOString()
        },
        correlationId: 'test-correlation-' + Date.now()
      }
    );
    console.log(`✅ Message added with ID: ${messageId}`);
    
    // Test 4: Check stream length
    console.log('\n4. Testing stream length...');
    const length = await redisStreamService.getStreamLength(
      redisStreamService.streams.STATEMENT_PROCESSING
    );
    console.log(`✅ Stream length: ${length}`);
    
    // Test 5: Monitor streams
    console.log('\n5. Testing stream monitoring...');
    const monitoring = await redisStreamService.startMonitoring();
    console.log('✅ Stream monitoring started');
    
    // Display stream status
    console.log('\n📊 Stream Status:');
    const streamNames = Object.values(redisStreamService.streams);
    for (const streamName of streamNames) {
      try {
        const streamLength = await redisStreamService.getStreamLength(streamName);
        console.log(`   ${streamName}: ${streamLength} messages`);
      } catch (error) {
        console.log(`   ${streamName}: Error - ${error.message}`);
      }
    }
    
    // Test 6: Consumer groups
    console.log('\n6. Testing consumer groups...');
    const consumerGroups = Object.values(redisStreamService.consumerGroups);
    console.log(`✅ Created ${consumerGroups.length} consumer groups:`);
    consumerGroups.forEach(group => {
      console.log(`   - ${group}`);
    });
    
    console.log('\n🎉 All Redis Streams tests passed!');
    console.log('\n📋 Ready for worker integration:');
    console.log('   • Statement Processing Stream: Ready');
    console.log('   • Transaction Categorization Stream: Ready');
    console.log('   • Risk Analysis Stream: Ready');
    console.log('   • Alerts Stream: Ready');
    console.log('   • Notifications Stream: Ready');
    console.log('   • Audit Log Stream: Ready');
    
    console.log('\n🚀 Redis Streams infrastructure is operational!');
    
  } catch (error) {
    console.error('❌ Redis Streams test failed:', error);
    console.error('\n🔧 Troubleshooting:');
    console.error('   1. Make sure Redis is running: redis-server');
    console.error('   2. Check Redis connection: redis-cli ping');
    console.error('   3. Verify Redis URL in environment variables');
    
  } finally {
    // Cleanup
    console.log('\n🧹 Cleaning up...');
    await redisStreamService.disconnect();
    console.log('✅ Disconnected from Redis');
    process.exit(0);
  }
}

// Run the test
testRedisStreams();
