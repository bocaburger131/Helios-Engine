import riskAnalysisService from './src/services/riskAnalysisService.temp.js';
import logger from './src/utils/logger.js';

/**
 * Example: How to integrate the AI categorization caching into existing controllers
 * This shows the simple changes needed to add caching to your transaction processing
 */

/**
 * Example 1: Basic integration in statement processing
 */
export async function processStatementsWithCaching(transactions) {
  console.log('🔄 Processing transactions with AI categorization caching...');
  
  try {
    // Instead of calling LLM directly for each transaction,
    // use the cached categorization method
    const categorizedTransactions = await riskAnalysisService.categorizeTransactionsWithCache(
      transactions,
      { 
        batchSize: 20,        // Process 20 transactions at a time
        showProgress: true    // Show progress for long lists
      }
    );

    // Now you have categorized transactions with cache benefits
    console.log(`✅ Categorized ${categorizedTransactions.length} transactions`);
    
    // The results include additional metadata
    categorizedTransactions.forEach(result => {
      const transaction = result.transaction;
      transaction.category = result.category;
      transaction.categoryConfidence = result.confidence;
      transaction.categorySource = result.source; // 'cache', 'llm', or 'fallback'
      transaction.categoryCached = result.cached;
    });

    return categorizedTransactions;
    
  } catch (error) {
    logger.error('Error processing transactions with caching:', error);
    throw error;
  }
}

/**
 * Example 2: Single transaction categorization (for real-time processing)
 */
export async function categorizeSingleTransaction(transaction) {
  console.log(`🔍 Categorizing single transaction: "${transaction.description}"`);
  
  try {
    const result = await riskAnalysisService.categorizeTransactionWithCache(transaction);
    
    // Log cache hit/miss for monitoring
    if (result.cached) {
      logger.info(`💾 Cache hit for transaction categorization (uses: ${result.useCount})`);
    } else {
      logger.info(`🤖 LLM categorization for new transaction pattern`);
    }

    return {
      ...transaction,
      category: result.category,
      categoryConfidence: result.confidence,
      categorySource: result.source,
      categoryCached: result.cached
    };
    
  } catch (error) {
    logger.error('Error categorizing single transaction:', error);
    // Return transaction with fallback category
    return {
      ...transaction,
      category: 'Other',
      categoryConfidence: 0.1,
      categorySource: 'error'
    };
  }
}

/**
 * Example 3: Integration in existing statementController
 */
export async function enhancedStatementControllerExample(req, res) {
  try {
    // ... existing PDF parsing code ...
    
    // After parsing transactions, categorize them with caching
    console.log('🏷️  Categorizing transactions with AI caching...');
    const categorizationResults = await riskAnalysisService.categorizeTransactionsWithCache(
      transactions,
      { batchSize: 15, showProgress: false }
    );

    // Apply categorization results to transactions
    const categorizedTransactions = categorizationResults.map(result => ({
      ...result.transaction,
      category: result.category,
      categoryConfidence: result.confidence,
      categorySource: result.source
    }));

    // Continue with existing risk analysis
    const riskAnalysis = riskAnalysisService.analyzeRisk(categorizedTransactions, openingBalance);
    
    // ... rest of existing controller logic ...

    // Include cache statistics in response for monitoring
    const cacheStats = await riskAnalysisService.getCacheStatistics();
    
    res.json({
      success: true,
      data: {
        transactions: categorizedTransactions,
        riskAnalysis,
        // ... other existing data ...
        
        // Add cache performance metrics
        categorization: {
          totalTransactions: categorizedTransactions.length,
          cacheHits: categorizationResults.filter(r => r.cached).length,
          llmCalls: categorizationResults.filter(r => r.source === 'llm').length,
          cacheHitRate: `${(categorizationResults.filter(r => r.cached).length / categorizedTransactions.length * 100).toFixed(1)}%`
        }
      },
      metadata: {
        cacheStatistics: cacheStats.success ? cacheStats.data : null
      }
    });

  } catch (error) {
    logger.error('Enhanced statement controller error:', error);
    res.status(500).json({
      success: false,
      error: 'Statement processing failed',
      message: error.message
    });
  }
}

/**
 * Example 4: Cache maintenance endpoint
 */
export async function cacheMaintenanceEndpoint(req, res) {
  try {
    const { action, daysOld = 90, minUseCount = 1 } = req.body;

    switch (action) {
      case 'stats':
        const stats = await riskAnalysisService.getCacheStatistics();
        res.json(stats);
        break;

      case 'cleanup':
        const cleanupResult = await riskAnalysisService.cleanupCategorizationCache(
          parseInt(daysOld), 
          parseInt(minUseCount)
        );
        res.json(cleanupResult);
        break;

      case 'refresh':
        const { description } = req.body;
        if (!description) {
          return res.status(400).json({
            success: false,
            error: 'Description required for refresh'
          });
        }
        const refreshResult = await riskAnalysisService.refreshCacheEntry(description);
        res.json(refreshResult);
        break;

      default:
        res.status(400).json({
          success: false,
          error: 'Invalid action. Use: stats, cleanup, or refresh'
        });
    }

  } catch (error) {
    logger.error('Cache maintenance error:', error);
    res.status(500).json({
      success: false,
      error: 'Cache maintenance failed',
      message: error.message
    });
  }
}

/**
 * Example 5: Monitoring cache performance
 */
export async function monitorCachePerformance() {
  try {
    const stats = await riskAnalysisService.getCacheStatistics();
    
    if (stats.success) {
      // Log key metrics for monitoring
      logger.info('📊 Cache Performance Metrics:', {
        totalEntries: stats.data.totalEntries,
        recentlyUsed: stats.data.recentlyUsed,
        efficiency: stats.data.cacheEfficiency,
        topCategories: stats.data.topCategories.slice(0, 5)
      });

      // Alert if cache efficiency is low
      const efficiency = parseFloat(stats.data.cacheEfficiency);
      if (efficiency < 70) {
        logger.warn(`⚠️  Cache efficiency is low: ${efficiency}% - consider cleanup`);
      }

      // Alert if cache is growing too large
      if (stats.data.totalEntries > 10000) {
        logger.warn(`⚠️  Cache size is large: ${stats.data.totalEntries} entries - consider cleanup`);
      }
    }

    return stats;
    
  } catch (error) {
    logger.error('Error monitoring cache performance:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Example usage patterns and best practices
 */
console.log(`
🚀 AI Transaction Categorization Caching - Integration Examples
═════════════════════════════════════════════════════════════

✅ IMPLEMENTATION COMPLETE!

📋 What was created:
   • TransactionCategory Mongoose model with indexed fields
   • Cache-enabled categorization methods in RiskAnalysisService
   • Comprehensive test suite
   • Integration examples

🔧 Key Features:
   • ⚡ Fast cache lookups with indexed descriptions
   • 🤖 Automatic LLM fallback for cache misses
   • 📊 Usage statistics and performance monitoring
   • 🧹 Automatic cache cleanup utilities
   • 🔄 Cache refresh capabilities

💡 Usage in your controllers:
   
   // Before (direct LLM calls):
   const category = await llmService.categorize(transaction);
   
   // After (with caching):
   const result = await riskAnalysisService.categorizeTransactionWithCache(transaction);

🎯 Benefits:
   • Significant speed improvement for repeated descriptions
   • Reduced LLM API costs
   • Better user experience with faster responses
   • Detailed analytics on categorization patterns

📈 Expected Performance:
   • First run: All LLM calls (slower)
   • Subsequent runs: 70-90% cache hits (much faster)
   • Cache hit rate improves over time with usage

🛠️  Maintenance:
   • Run cache cleanup periodically: riskAnalysisService.cleanupCategorizationCache()
   • Monitor performance: riskAnalysisService.getCacheStatistics()
   • Refresh stale entries: riskAnalysisService.refreshCacheEntry(description)

🧪 Test it:
   node test-transaction-categorization-cache.js
`);

export default {
  processStatementsWithCaching,
  categorizeSingleTransaction,
  enhancedStatementControllerExample,
  cacheMaintenanceEndpoint,
  monitorCachePerformance
};
