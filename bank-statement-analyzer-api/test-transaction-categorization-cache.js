import mongoose from 'mongoose';
import TransactionCategory from './src/models/TransactionCategory.js';
import riskAnalysisService from './src/services/riskAnalysisService.temp.js';
import logger from './src/utils/logger.js';

/**
 * Comprehensive test for AI-powered transaction categorization caching
 */
async function testCategorizationCache() {
  console.log('🚀 Testing AI-Powered Transaction Categorization with Caching');
  console.log('═══════════════════════════════════════════════════════════════');

  try {
    // Connect to MongoDB if not already connected
    if (mongoose.connection.readyState !== 1) {
      console.log('📡 Connecting to MongoDB...');
      await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/bank-statement-analyzer');
      console.log('✅ Connected to MongoDB');
    }

    // Clear existing cache for clean test
    console.log('\n🧹 Clearing existing cache for clean test...');
    await TransactionCategory.deleteMany({});
    console.log('✅ Cache cleared');

    // Test data - realistic transaction descriptions
    const testTransactions = [
      { description: 'PAYROLL DEPOSIT ACME CORP', amount: 3500.00, date: '2024-01-15' },
      { description: 'AMAZON.COM PURCHASE', amount: -89.99, date: '2024-01-16' },
      { description: 'STARBUCKS #1234 SEATTLE WA', amount: -5.47, date: '2024-01-16' },
      { description: 'SHELL GAS STATION', amount: -45.20, date: '2024-01-17' },
      { description: 'RENT PAYMENT PROP MGT', amount: -1200.00, date: '2024-01-17' },
      { description: 'CVS PHARMACY #5678', amount: -23.45, date: '2024-01-18' },
      { description: 'NETFLIX SUBSCRIPTION', amount: -15.99, date: '2024-01-18' },
      { description: 'ATM WITHDRAWAL', amount: -100.00, date: '2024-01-19' },
      { description: 'ELECTRIC COMPANY BILL', amount: -150.30, date: '2024-01-19' },
      { description: 'UBER RIDE', amount: -18.75, date: '2024-01-20' },
      // Duplicate descriptions to test cache hits
      { description: 'AMAZON.COM PURCHASE', amount: -34.99, date: '2024-01-21' },
      { description: 'STARBUCKS #1234 SEATTLE WA', amount: -6.25, date: '2024-01-22' },
      { description: 'SHELL GAS STATION', amount: -52.10, date: '2024-01-23' }
    ];

    console.log(`\n📊 Test Dataset: ${testTransactions.length} transactions`);
    console.log('   - 10 unique descriptions + 3 duplicates for cache testing');

    // Phase 1: First categorization (should be all LLM calls)
    console.log('\n🔍 Phase 1: Initial Categorization (All LLM calls expected)');
    console.log('─────────────────────────────────────────────────────────────');
    
    const startTime1 = Date.now();
    const results1 = await riskAnalysisService.categorizeTransactionsWithCache(
      testTransactions, 
      { showProgress: true }
    );
    const duration1 = Date.now() - startTime1;

    console.log('\n📋 Results Phase 1:');
    results1.forEach((result, index) => {
      const status = result.cached ? '💾 CACHED' : '🤖 LLM';
      console.log(`  ${index + 1}. ${status} | ${result.category} (${(result.confidence * 100).toFixed(1)}%) | "${result.transaction.description}"`);
    });

    console.log(`\n⏱️  Phase 1 Duration: ${duration1}ms`);
    console.log(`📊 Cache hits: ${results1.filter(r => r.cached).length}/${results1.length}`);
    console.log(`🤖 LLM calls: ${results1.filter(r => r.source === 'llm').length}/${results1.length}`);

    // Phase 2: Re-categorize same transactions (should show cache hits)
    console.log('\n🔍 Phase 2: Re-categorization (Cache hits expected)');
    console.log('─────────────────────────────────────────────────────────────');
    
    const startTime2 = Date.now();
    const results2 = await riskAnalysisService.categorizeTransactionsWithCache(
      testTransactions,
      { showProgress: true }
    );
    const duration2 = Date.now() - startTime2;

    console.log('\n📋 Results Phase 2:');
    results2.forEach((result, index) => {
      const status = result.cached ? '💾 CACHED' : '🤖 LLM';
      const speedup = result.cached ? '⚡ FAST' : '';
      console.log(`  ${index + 1}. ${status} ${speedup} | ${result.category} | Uses: ${result.useCount || 1} | "${result.transaction.description}"`);
    });

    console.log(`\n⏱️  Phase 2 Duration: ${duration2}ms (${((duration1 - duration2) / duration1 * 100).toFixed(1)}% faster)`);
    console.log(`📊 Cache hits: ${results2.filter(r => r.cached).length}/${results2.length}`);
    console.log(`🤖 LLM calls: ${results2.filter(r => r.source === 'llm').length}/${results2.length}`);

    // Phase 3: Test single transaction categorization
    console.log('\n🔍 Phase 3: Single Transaction Categorization');
    console.log('─────────────────────────────────────────────────────────────');
    
    const newTransaction = { 
      description: 'MCDONALDS #9876 NEW YORK NY', 
      amount: -12.45, 
      date: '2024-01-24' 
    };
    
    console.log(`Testing new transaction: "${newTransaction.description}"`);
    
    const singleResult = await riskAnalysisService.categorizeTransactionWithCache(newTransaction);
    console.log(`Result: ${singleResult.category} (${(singleResult.confidence * 100).toFixed(1)}%) - Source: ${singleResult.source}`);
    
    // Test cache hit for the same transaction
    const singleResult2 = await riskAnalysisService.categorizeTransactionWithCache(newTransaction);
    console.log(`Second call: ${singleResult2.category} (${(singleResult2.confidence * 100).toFixed(1)}%) - Source: ${singleResult2.source} - Uses: ${singleResult2.useCount}`);

    // Phase 4: Cache statistics
    console.log('\n📊 Phase 4: Cache Statistics');
    console.log('─────────────────────────────────────────────────────────────');
    
    const stats = await riskAnalysisService.getCacheStatistics();
    if (stats.success) {
      console.log(`Total cache entries: ${stats.data.totalEntries}`);
      console.log(`Recently used entries: ${stats.data.recentlyUsed}`);
      console.log(`Cache efficiency: ${stats.data.cacheEfficiency}`);
      console.log('\nTop categories:');
      stats.data.topCategories.forEach((cat, index) => {
        console.log(`  ${index + 1}. ${cat._id}: ${cat.count} entries, ${cat.totalUses} total uses`);
      });
    }

    // Phase 5: Test cache refresh
    console.log('\n🔄 Phase 5: Cache Refresh Test');
    console.log('─────────────────────────────────────────────────────────────');
    
    const refreshResult = await riskAnalysisService.refreshCacheEntry('AMAZON.COM PURCHASE');
    if (refreshResult.success) {
      console.log(`✅ Refreshed: "${refreshResult.description}" -> ${refreshResult.category} (${(refreshResult.confidence * 100).toFixed(1)}%)`);
    } else {
      console.log(`❌ Refresh failed: ${refreshResult.error}`);
    }

    // Phase 6: Performance comparison
    console.log('\n⚡ Phase 6: Performance Analysis');
    console.log('─────────────────────────────────────────────────────────────');
    
    const speedImprovement = ((duration1 - duration2) / duration1 * 100).toFixed(1);
    const avgCacheHitTime = duration2 / results2.filter(r => r.cached).length;
    
    console.log(`Performance improvements with caching:`);
    console.log(`• Speed improvement: ${speedImprovement}% faster on second run`);
    console.log(`• Average cache hit time: ${avgCacheHitTime.toFixed(1)}ms per transaction`);
    console.log(`• Cache hit rate: ${((results2.filter(r => r.cached).length / results2.length) * 100).toFixed(1)}%`);

    // Phase 7: Category distribution analysis
    console.log('\n📈 Phase 7: Category Distribution Analysis');
    console.log('─────────────────────────────────────────────────────────────');
    
    const categoryCount = {};
    results2.forEach(result => {
      categoryCount[result.category] = (categoryCount[result.category] || 0) + 1;
    });
    
    console.log('Category distribution:');
    Object.entries(categoryCount)
      .sort(([,a], [,b]) => b - a)
      .forEach(([category, count]) => {
        console.log(`  • ${category}: ${count} transactions`);
      });

    console.log('\n✅ All tests completed successfully!');
    console.log('═══════════════════════════════════════════════════════════════');
    
    return {
      success: true,
      phases: {
        initialCategorization: { duration: duration1, cacheHits: 0, llmCalls: results1.filter(r => r.source === 'llm').length },
        cachedCategorization: { duration: duration2, cacheHits: results2.filter(r => r.cached).length, llmCalls: results2.filter(r => r.source === 'llm').length },
        speedImprovement: `${speedImprovement}%`,
        cacheStats: stats
      }
    };

  } catch (error) {
    console.error('❌ Test failed:', error);
    return {
      success: false,
      error: error.message,
      stack: error.stack
    };
  }
}

// Run the test if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  testCategorizationCache()
    .then(result => {
      if (result.success) {
        console.log('\n🎉 Transaction categorization caching test completed successfully!');
        process.exit(0);
      } else {
        console.error('\n💥 Test failed:', result.error);
        process.exit(1);
      }
    })
    .catch(error => {
      console.error('\n💥 Unexpected error:', error);
      process.exit(1);
    });
}

export default testCategorizationCache;
