import dotenv from 'dotenv';
import mongoose from 'mongoose';
import perplexityEnhancer from './src/services/perplexityEnhancementService.js';
import Merchant from './src/models/Merchant.js';

dotenv.config();

async function testMerchantCache() {
    console.log('🏪 Testing Merchant Cache System\n');
    
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('✅ Connected to MongoDB\n');
        
        // Test transactions - some repeated merchants
        const testTransactions = [
            { _id: '1', description: 'STARBUCKS #12345 NYC', amount: 5.50, type: 'debit' },
            { _id: '2', description: 'NETFLIX.COM MONTHLY', amount: 15.99, type: 'debit' },
            { _id: '3', description: 'STARBUCKS #98765 LA', amount: 6.25, type: 'debit' }, // Same merchant
            { _id: '4', description: 'AMAZON.COM*ABC123', amount: 45.99, type: 'debit' },
            { _id: '5', description: 'NETFLIX.COM SUBSCRIPTION', amount: 15.99, type: 'debit' }, // Same merchant
            { _id: '6', description: 'UBER *TRIP NYC', amount: 23.45, type: 'debit' },
            { _id: '7', description: 'STARBUCKS STORE', amount: 4.95, type: 'debit' } // Same merchant
        ];
        
        console.log('🔄 First run - All transactions will be processed by AI...\n');
        const firstRun = await perplexityEnhancer.processBatch(testTransactions);
        
        console.log('Results from first run:');
        firstRun.forEach((result, i) => {
            console.log(`${testTransactions[i].description}: ${result.category} (${result.aiAnalysis.method})`);
        });
        
        // Check merchant cache
        const merchantCount = await Merchant.countDocuments();
        console.log(`\n📦 Merchants cached: ${merchantCount}\n`);
        
        // Second run with same merchants
        console.log('🔄 Second run - Should use cache for known merchants...\n');
        const secondRun = await perplexityEnhancer.processBatch(testTransactions);
        
        console.log('Results from second run:');
        secondRun.forEach((result, i) => {
            console.log(`${testTransactions[i].description}: ${result.category} (${result.aiAnalysis.method})`);
        });
        
        // Show cache statistics
        console.log('\n📊 Cache Statistics:');
        const stats = await perplexityEnhancer.getCacheStats();
        console.log(`Total merchants: ${stats.totalMerchants}`);
        console.log('\nCategories:');
        stats.categoryCounts.forEach(cat => {
            console.log(`  ${cat._id}: ${cat.count}`);
        });
        console.log('\nTop merchants by usage:');
        stats.topMerchants.forEach(merchant => {
            console.log(`  ${merchant.displayName}: ${merchant.usageCount} uses`);
        });
        
        // Test manual update
        console.log('\n✏️  Testing manual merchant update...');
        await perplexityEnhancer.updateMerchantCategory(
          'UBER',
          'Transportation',
          ['rideshare', 'recurring']
        );
        console.log('Updated UBER category');
        
        // Cleanup test data
        console.log('\n🧹 Cleaning up test merchants...');
        await Merchant.deleteMany({ source: 'ai' });
        
    } catch (error) {
        console.error('❌ Error:', error.message);
    } finally {
        await mongoose.disconnect();
        console.log('\n👋 Disconnected');
    }
}

testMerchantCache().catch(console.error);