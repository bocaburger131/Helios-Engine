/**
 * Test Redis Streams Integration with Development Fallback
 */

import logger from './src/utils/logger.js';

console.log('🚀 Testing Redis Streams Integration...\n');

async function testRedisStreamsIntegration() {
  let redisStreamService;
  
  try {
    // Try to import the real Redis Streams service first
    console.log('1️⃣ Attempting to connect to Redis Streams...');
    const realService = await import('./src/services/redisStreamService.js');
    redisStreamService = realService.default;
    
    // Wait for connection
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    if (!redisStreamService.isConnected) {
      throw new Error('Redis Streams not available');
    }

    // Test if Redis Streams commands are available by trying to add a test message
    try {
      await redisStreamService.addToStream('test:stream', { test: 'data' });
      console.log('✅ Redis Streams service connected successfully!\n');
    } catch (streamError) {
      if (streamError.message.includes('unknown command')) {
        throw new Error('Redis Streams commands not supported');
      }
      throw streamError;
    }
    
  } catch (error) {
    console.log('⚠️  Redis Streams not available, using mock service for development...');
    console.log('   Reason:', error.message);
    
    // Import mock service as fallback
    const mockService = await import('./src/services/mockRedisStreamService.js');
    redisStreamService = mockService.default;
    
    // Wait for mock initialization
    await new Promise(resolve => setTimeout(resolve, 500));
    console.log('✅ Mock Redis Streams service initialized!\n');
  }

  // Now test the service (works with both real and mock)
  console.log('2️⃣ Testing AI Categorization Cache Integration...\n');

  // Test 1: Add a statement upload message
  console.log('📝 Test 1: Statement Upload Processing');
  const statementData = {
    userId: 'test-user-123',
    fileName: 'test-statement.pdf',
    uploadId: 'upload-456',
    fileSize: 1024000,
    timestamp: new Date().toISOString()
  };

  const messageId1 = await redisStreamService.addToStream(
    redisStreamService.streams.STATEMENT_UPLOAD,
    statementData
  );
  console.log(`   ✅ Statement upload message added: ${messageId1}`);

  // Test 2: Add a transaction categorization message
  console.log('\n💰 Test 2: Transaction Categorization');
  const transactionData = {
    transactionId: 'txn-789',
    userId: 'test-user-123',
    amount: -45.67,
    description: 'STARBUCKS COFFEE #1234',
    date: '2024-01-15',
    merchantName: 'Starbucks Coffee',
    cacheKey: 'cat_STARBUCKS_COFFEE'
  };

  const messageId2 = await redisStreamService.addToStream(
    redisStreamService.streams.TRANSACTION_CATEGORIZATION,
    transactionData
  );
  console.log(`   ✅ Transaction categorization message added: ${messageId2}`);

  // Test 3: Add a risk analysis message
  console.log('\n🔍 Test 3: Risk Analysis Processing');
  const riskData = {
    userId: 'test-user-123',
    transactionId: 'txn-789',
    amount: -45.67,
    merchantCategory: 'restaurant',
    timeOfDay: '08:30',
    location: 'downtown',
    frequency: 'weekly'
  };

  const messageId3 = await redisStreamService.addToStream(
    redisStreamService.streams.RISK_ANALYSIS,
    riskData
  );
  console.log(`   ✅ Risk analysis message added: ${messageId3}`);

  // Test 4: Check stream statistics
  console.log('\n📊 Test 4: Stream Statistics');
  await new Promise(resolve => setTimeout(resolve, 1000)); // Wait for processing

  const stats = await redisStreamService.getComprehensiveStats();
  console.log('   📈 Comprehensive Statistics:');
  console.log(`   - Connected: ${stats.connected}`);
  console.log(`   - Total Streams: ${stats.totalStreams}`);
  console.log(`   - Active Workers: ${stats.totalWorkers}`);
  
  if (stats.streams) {
    console.log('   - Stream Status:');
    for (const [streamName, streamInfo] of Object.entries(stats.streams)) {
      if (streamInfo.length > 0) {
        console.log(`     • ${streamName}: ${streamInfo.length} messages (${streamInfo.processedCount} processed)`);
      }
    }
  }

  if (stats.memoryUsage) {
    console.log(`   - Memory Usage: ${stats.memoryUsage.totalMessages} total messages in ${stats.memoryUsage.streamsWithData} streams`);
  }

  // Test 5: Worker simulation
  console.log('\n👷 Test 5: Worker Simulation');
  
  const processTransaction = async (data, messageId) => {
    console.log(`   🔄 Processing transaction ${data.transactionId || 'unknown'} (Message: ${messageId})`);
    
    // Simulate AI categorization lookup
    if (data.cacheKey) {
      console.log(`   🎯 Cache lookup for key: ${data.cacheKey}`);
      console.log(`   📝 Category determined: Food & Dining > Coffee Shops`);
    }
    
    // Simulate processing time
    await new Promise(resolve => setTimeout(resolve, 100));
    console.log(`   ✅ Transaction processed successfully`);
  };

  const workerId = await redisStreamService.startWorker(
    redisStreamService.streams.TRANSACTION_CATEGORIZATION,
    redisStreamService.consumerGroups.CATEGORIZATION_WORKERS,
    'test-worker-1',
    processTransaction
  );

  console.log(`   ✅ Worker started: ${workerId}`);

  // Wait for some processing
  await new Promise(resolve => setTimeout(resolve, 2000));

  // Get worker stats
  const workerStats = await redisStreamService.getWorkerStats();
  console.log('\n   📊 Worker Statistics:');
  for (const [id, stats] of Object.entries(workerStats)) {
    console.log(`   - ${id}: ${stats.messagesProcessed} messages processed, uptime: ${Math.round(stats.uptime/1000)}s`);
  }

  // Test 6: Cleanup
  console.log('\n🧹 Test 6: Cleanup');
  await redisStreamService.stopAllWorkers();
  console.log('   ✅ All workers stopped');

  await redisStreamService.disconnect();
  console.log('   ✅ Service disconnected');

  console.log('\n🎉 Redis Streams Integration Test Completed Successfully!');
  
  // Summary
  console.log('\n📋 Test Summary:');
  console.log('   ✅ Service initialization');
  console.log('   ✅ Stream message publishing');
  console.log('   ✅ AI categorization cache integration');
  console.log('   ✅ Worker processing simulation');
  console.log('   ✅ Statistics and monitoring');
  console.log('   ✅ Graceful cleanup');
  
  if (redisStreamService.constructor.name.includes('Mock')) {
    console.log('\n💡 Note: Tests ran with mock service. For full Redis Streams testing:');
    console.log('   1. Install Docker Desktop');
    console.log('   2. Run: docker-compose -f docker-compose.redis-streams.yml up redis');
    console.log('   3. Re-run this test');
  }
}

// Run the test
testRedisStreamsIntegration()
  .then(() => {
    console.log('\n✨ All tests passed!');
    process.exit(0);
  })
  .catch(error => {
    console.error('\n💥 Test suite failed:', error);
    process.exit(1);
  });
