#!/usr/bin/env node

/**
 * AI-Powered Transaction Categorization Caching System - Demo
 * 
 * This demonstration shows how to use the complete AI-powered transaction 
 * categorization system with intelligent caching for bank statement analysis.
 * 
 * Features demonstrated:
 * - Automatic transaction categorization using AI
 * - Intelligent caching for performance optimization
 * - Cache statistics and management
 * - Batch processing capabilities
 * - Error handling and fallback mechanisms
 */

import mongoose from 'mongoose';
import TransactionCategory from './src/models/TransactionCategory.js';
import riskAnalysisService from './src/services/riskAnalysisService.js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Demo configuration
const DEMO_CONFIG = {
  MONGODB_URI: process.env.MONGODB_URI || 'mongodb://localhost:27017/bank-analyzer',
  SHOW_DETAILED_LOGS: true
};

// Real-world sample transactions for demonstration
const DEMO_TRANSACTIONS = [
  {
    description: 'WALMART SUPERCENTER #1234 ANYTOWN USA',
    amount: -127.83,
    date: new Date('2024-01-15'),
    type: 'debit'
  },
  {
    description: 'STARBUCKS STORE #5678 COFFEE PURCHASE',
    amount: -6.47,
    date: new Date('2024-01-16'),
    type: 'debit'
  },
  {
    description: 'SHELL OIL GAS STATION #9101 FUEL',
    amount: -52.30,
    date: new Date('2024-01-17'),
    type: 'debit'
  },
  {
    description: 'PAYROLL DIRECT DEPOSIT ACME CORP',
    amount: 3250.00,
    date: new Date('2024-01-18'),
    type: 'credit'
  },
  {
    description: 'NETFLIX MONTHLY SUBSCRIPTION',
    amount: -15.99,
    date: new Date('2024-01-19'),
    type: 'debit'
  },
  {
    description: 'AMAZON.COM ORDER PURCHASE',
    amount: -89.99,
    date: new Date('2024-01-20'),
    type: 'debit'
  },
  {
    description: 'MCDONALDS RESTAURANT #3456 MEAL',
    amount: -12.67,
    date: new Date('2024-01-21'),
    type: 'debit'
  },
  {
    description: 'ELECTRIC UTILITY COMPANY MONTHLY BILL',
    amount: -143.22,
    date: new Date('2024-01-22'),
    type: 'debit'
  },
  {
    description: 'WALMART SUPERCENTER #1234 ANYTOWN USA', // Duplicate to show caching
    amount: -67.45,
    date: new Date('2024-01-23'),
    type: 'debit'
  },
  {
    description: 'UBER RIDE SERVICE TRANSPORTATION',
    amount: -18.75,
    date: new Date('2024-01-24'),
    type: 'debit'
  }
];

class CategorizationDemo {
  constructor() {
    this.isConnected = false;
  }

  /**
   * Initialize the demo environment
   */
  async initialize() {
    try {
      console.log('🤖 AI-Powered Transaction Categorization Demo');
      console.log('===============================================\\n');
      
      console.log('🔌 Connecting to MongoDB...');
      await mongoose.connect(DEMO_CONFIG.MONGODB_URI);
      this.isConnected = true;
      console.log('✅ Connected to MongoDB successfully\\n');
      
      return true;
    } catch (error) {
      console.error('❌ Failed to initialize demo:', error.message);
      return false;
    }
  }

  /**
   * Demonstrate single transaction categorization
   */
  async demonstrateSingleCategorization() {
    console.log('📝 Single Transaction Categorization Demo');
    console.log('==========================================\\n');

    const transaction = DEMO_TRANSACTIONS[0]; // Walmart transaction
    
    console.log(`Processing transaction: "${transaction.description}"`);
    console.log(`Amount: $${Math.abs(transaction.amount).toFixed(2)}`);
    console.log(`Date: ${transaction.date.toDateString()}\\n`);

    try {
      const startTime = Date.now();
      const result = await riskAnalysisService.categorizeTransactionWithCache(transaction);
      const processingTime = Date.now() - startTime;

      console.log('✅ Categorization Result:');
      console.log(`   Category: ${result.category}`);
      console.log(`   Confidence: ${(result.confidence * 100).toFixed(1)}%`);
      console.log(`   Source: ${result.source}`);
      console.log(`   Cache Hit: ${result.cacheHit ? 'Yes' : 'No'}`);
      console.log(`   Processing Time: ${processingTime}ms`);
      
      if (result.alternatives && result.alternatives.length > 0) {
        console.log(`   Alternative Categories:`);
        result.alternatives.forEach((alt, index) => {
          console.log(`     ${index + 1}. ${alt.category} (${(alt.confidence * 100).toFixed(1)}%)`);
        });
      }

      console.log('\\n');
      return result;
    } catch (error) {
      console.error('❌ Categorization failed:', error.message);
      return null;
    }
  }

  /**
   * Demonstrate batch transaction categorization
   */
  async demonstrateBatchCategorization() {
    console.log('📦 Batch Transaction Categorization Demo');
    console.log('=========================================\\n');

    console.log(`Processing ${DEMO_TRANSACTIONS.length} transactions...\\n`);

    try {
      const startTime = Date.now();
      const result = await riskAnalysisService.categorizeTransactionsWithCache(DEMO_TRANSACTIONS);
      const totalTime = Date.now() - startTime;

      console.log('✅ Batch Processing Complete!\\n');
      console.log('📊 Processing Statistics:');
      console.log(`   Total Transactions: ${result.stats.total}`);
      console.log(`   Cache Hits: ${result.stats.cacheHits}`);
      console.log(`   Cache Misses: ${result.stats.cacheMisses}`);
      console.log(`   Cache Hit Rate: ${result.stats.cacheHitRate}%`);
      console.log(`   Total Processing Time: ${totalTime}ms`);
      console.log(`   Average Time per Transaction: ${(totalTime / result.stats.total).toFixed(2)}ms\\n`);

      console.log('📋 Categorized Transactions:');
      console.log('==============================');
      
      // Group transactions by category for better visualization
      const categoryGroups = {};
      result.categorizedTransactions.forEach(transaction => {
        const category = transaction.category || 'Unknown';
        if (!categoryGroups[category]) {
          categoryGroups[category] = [];
        }
        categoryGroups[category].push(transaction);
      });

      Object.entries(categoryGroups).forEach(([category, transactions]) => {
        console.log(`\\n🏷️  ${category} (${transactions.length} transactions):`);
        transactions.forEach(transaction => {
          const amount = Math.abs(transaction.amount).toFixed(2);
          const description = transaction.description.length > 50 ? 
            transaction.description.substring(0, 47) + '...' : 
            transaction.description;
          console.log(`   • $${amount} - ${description}`);
        });
      });

      console.log('\\n');
      return result;
    } catch (error) {
      console.error('❌ Batch categorization failed:', error.message);
      return null;
    }
  }

  /**
   * Demonstrate cache performance improvement
   */
  async demonstrateCachePerformance() {
    console.log('⚡ Cache Performance Demonstration');
    console.log('===================================\\n');

    // Use the same transaction multiple times to show cache effectiveness
    const repeatedTransaction = DEMO_TRANSACTIONS[0];
    const iterations = 5;

    console.log(`Testing cache performance with ${iterations} identical transactions...\\n`);

    const results = [];
    for (let i = 0; i < iterations; i++) {
      const startTime = Date.now();
      const result = await riskAnalysisService.categorizeTransactionWithCache(repeatedTransaction);
      const processingTime = Date.now() - startTime;
      
      results.push({
        iteration: i + 1,
        processingTime,
        cacheHit: result.cacheHit,
        source: result.source
      });

      console.log(`Iteration ${i + 1}: ${processingTime}ms (${result.source}${result.cacheHit ? ' - Cache Hit' : ''})`);
    }

    const avgFirstCallTime = results.filter(r => !r.cacheHit).reduce((sum, r) => sum + r.processingTime, 0) / results.filter(r => !r.cacheHit).length || 0;
    const avgCacheHitTime = results.filter(r => r.cacheHit).reduce((sum, r) => sum + r.processingTime, 0) / results.filter(r => r.cacheHit).length || 0;

    console.log('\\n📈 Performance Analysis:');
    console.log(`   Average first call time: ${avgFirstCallTime.toFixed(2)}ms`);
    console.log(`   Average cache hit time: ${avgCacheHitTime.toFixed(2)}ms`);
    
    if (avgCacheHitTime > 0 && avgFirstCallTime > 0) {
      const speedup = ((avgFirstCallTime - avgCacheHitTime) / avgFirstCallTime * 100);
      console.log(`   Performance improvement: ${speedup.toFixed(1)}% faster with cache`);
    }

    console.log('\\n');
  }

  /**
   * Demonstrate cache statistics and management
   */
  async demonstrateCacheManagement() {
    console.log('📊 Cache Management and Statistics');
    console.log('===================================\\n');

    try {
      // Get current cache statistics
      const stats = await riskAnalysisService.getCacheStatistics();
      
      console.log('📈 Current Cache Statistics:');
      console.log(`   Total Cached Entries: ${stats.totalEntries}`);
      console.log(`   Recently Used (7 days): ${stats.recentlyUsed}`);
      console.log(`   Cache Efficiency: ${stats.cacheEfficiency}%`);
      
      if (stats.topCategories && stats.topCategories.length > 0) {
        console.log('\\n🏆 Top Categories:');
        stats.topCategories.slice(0, 5).forEach((category, index) => {
          console.log(`   ${index + 1}. ${category._id}: ${category.count} entries (${category.totalUses} total uses)`);
        });
      }

      // Demonstrate cache cleanup
      console.log('\\n🧹 Cache Cleanup Demonstration:');
      const cleanupOptions = {
        daysOld: 365,  // Remove entries older than 1 year
        minUseCount: 0 // Remove entries with no uses (for demo)
      };

      const cleanupResult = await riskAnalysisService.cleanupCategorizationCache(cleanupOptions);
      console.log(`   Cleanup completed: ${cleanupResult.deletedCount} entries removed`);
      console.log(`   ${cleanupResult.message}`);

      console.log('\\n');
    } catch (error) {
      console.error('❌ Cache management demonstration failed:', error.message);
    }
  }

  /**
   * Demonstrate direct TransactionCategory model usage
   */
  async demonstrateDirectModelUsage() {
    console.log('🔧 Direct Model Usage Examples');
    console.log('===============================\\n');

    try {
      // Example 1: Manual cache entry
      console.log('1. Creating manual cache entry...');
      const manualEntry = await TransactionCategory.cacheCategory(
        'DEMO COFFEE SHOP PURCHASE',
        'Dining',
        0.92,
        'MANUAL',
        [
          { category: 'Entertainment', confidence: 0.3 },
          { category: 'Groceries', confidence: 0.2 }
        ]
      );
      console.log(`   ✅ Created: ${manualEntry.description} -> ${manualEntry.category}\\n`);

      // Example 2: Finding cached entry
      console.log('2. Finding cached entry...');
      const foundEntry = await TransactionCategory.findCachedCategory('DEMO COFFEE SHOP PURCHASE');
      if (foundEntry) {
        console.log(`   ✅ Found: ${foundEntry.category} (used ${foundEntry.useCount} times)`);
      } else {
        console.log('   ❌ Entry not found');
      }

      // Example 3: Cache statistics from model
      console.log('\\n3. Getting model-level statistics...');
      const modelStats = await TransactionCategory.getCacheStats();
      console.log(`   Total entries: ${modelStats.totalEntries}`);
      console.log(`   Recently used: ${modelStats.recentlyUsed}`);

      console.log('\\n');
    } catch (error) {
      console.error('❌ Direct model usage demonstration failed:', error.message);
    }
  }

  /**
   * Clean up demo environment
   */
  async cleanup() {
    try {
      if (this.isConnected) {
        await mongoose.connection.close();
        console.log('🔌 Database connection closed');
      }
    } catch (error) {
      console.error('❌ Cleanup error:', error.message);
    }
  }

  /**
   * Run the complete demonstration
   */
  async runDemo() {
    const initialized = await this.initialize();
    if (!initialized) {
      console.error('❌ Demo initialization failed');
      return false;
    }

    try {
      await this.demonstrateSingleCategorization();
      await this.demonstrateBatchCategorization();
      await this.demonstrateCachePerformance();
      await this.demonstrateCacheManagement();
      await this.demonstrateDirectModelUsage();

      console.log('🎉 Demo Completed Successfully!');
      console.log('===============================\\n');
      console.log('🎯 Key Features Demonstrated:');
      console.log('   ✅ AI-powered transaction categorization');
      console.log('   ✅ Intelligent caching for performance');
      console.log('   ✅ Batch processing capabilities');
      console.log('   ✅ Cache management and statistics');
      console.log('   ✅ Error handling and fallback mechanisms');
      console.log('   ✅ Direct model interaction examples\\n');
      
      console.log('🚀 Integration Ready:');
      console.log('   This system is now ready for integration into your');
      console.log('   bank statement analysis application. The caching');
      console.log('   will automatically improve performance over time as');
      console.log('   more transactions are processed.\\n');

      return true;
    } catch (error) {
      console.error('❌ Demo failed:', error.message);
      return false;
    } finally {
      await this.cleanup();
    }
  }
}

// Export for programmatic use
export default CategorizationDemo;

// Run demo if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const demo = new CategorizationDemo();
  
  demo.runDemo()
    .then(success => {
      console.log(`Demo ${success ? 'completed successfully' : 'failed'}`);
      process.exit(success ? 0 : 1);
    })
    .catch(error => {
      console.error('💥 Demo crashed:', error);
      process.exit(1);
    });
}
