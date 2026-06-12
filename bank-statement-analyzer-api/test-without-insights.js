import dotenv from 'dotenv';
import mongoose from 'mongoose';
import Transaction from './src/models/Transaction.js';
import Statement from './src/models/Statement.js';
import perplexityEnhancer from './src/services/perplexityEnhancementService.js';

dotenv.config();

async function testWithoutInsights() {
    console.log('🧪 Testing Enhancement Without Insights Generation\n');
    
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('✅ Connected to MongoDB\n');
        
        // Create test data
        const statement = await Statement.create({
            userId: new mongoose.Types.ObjectId(),
            fileName: 'test.pdf',
            fileSize: 1024,
            fileUrl: 'test-url',
            mimeType: 'application/pdf',
            startDate: new Date('2025-07-01'),
            endDate: new Date('2025-07-31'),
            accountType: 'checking',
            status: 'processing',
            totalIncome: 0,
            totalExpenses: 0,
            transactionCount: 0
        });
        
        const testTransactions = [
            { description: 'NETFLIX.COM', amount: 15.99, type: 'debit' },
            { description: 'STARBUCKS', amount: 5.50, type: 'debit' }
        ];
        
        const transactions = await Transaction.insertMany(
            testTransactions.map(t => ({
                ...t,
                statementId: statement._id,
                userId: statement.userId,
                date: new Date(),
                originalDescription: t.description,
                currency: 'USD',
                balance: 0
            }))
        );
        
        console.log('📝 Created test transactions');
        
        // Test just the categorization
        console.log('\n🏷️  Testing categorization...');
        const enhancements = await perplexityEnhancer.processBatch(transactions);
        
        console.log('\n📊 Categorization Results:');
        enhancements.forEach((e, i) => {
            console.log(`\n${transactions[i].description}:`);
            console.log(`  Category: ${e.category}`);
            console.log(`  Merchant: ${e.merchant}`);
            console.log(`  Tags: ${e.tags?.join(', ') || 'None'}`);
        });
        
        // Update transactions with enhancements
        for (const enhancement of enhancements) {
            await Transaction.findByIdAndUpdate(
                enhancement.transactionId,
                {
                    category: enhancement.category,
                    merchant: enhancement.merchant,
                    tags: enhancement.tags,
                    'metadata.aiAnalysis': enhancement.aiAnalysis
                }
            );
        }
        
        console.log('\n✅ Categorization completed successfully!');
        
        // Cleanup
        await Transaction.deleteMany({ statementId: statement._id });
        await Statement.findByIdAndDelete(statement._id);
        
    } catch (error) {
        console.error('❌ Error:', error.message);
    } finally {
        await mongoose.disconnect();
        console.log('\n👋 Disconnected');
    }
}

testWithoutInsights().catch(console.error);