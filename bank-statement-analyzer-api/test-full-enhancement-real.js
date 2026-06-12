import dotenv from 'dotenv';
import mongoose from 'mongoose';
import perplexityEnhancer from './src/services/perplexityEnhancementService.js';
import Transaction from './src/models/Transaction.js';
import Statement from './src/models/Statement.js';

dotenv.config();

async function testFullEnhancementReal() {
    console.log('🚀 Testing Full Enhancement with Real Database\n');
    
    try {
        // Connect to MongoDB
        console.log('📦 Connecting to MongoDB...');
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('✅ Connected to MongoDB\n');
        
        // Create a test statement with all required fields
        console.log('Creating test statement...');
        const testStatement = await Statement.create({
            userId: new mongoose.Types.ObjectId(),
            fileName: 'test-statement-july2025.pdf',
            fileSize: 2048,
            fileUrl: 'test-url',
            mimeType: 'application/pdf', // Add this required field
            startDate: new Date('2025-07-01'),
            endDate: new Date('2025-07-31'),
            accountType: 'checking',
            status: 'processing',
            totalIncome: 0,
            totalExpenses: 0,
            transactionCount: 0,
            metadata: {
                uploadedAt: new Date(),
                source: 'test',
                parsedAt: new Date()
            }
        });
        console.log('✅ Created statement:', testStatement._id);
        
        // Create test transactions
        const transactionData = [
            { description: 'STARBUCKS #12345 NYC', amount: 5.75, type: 'debit' },
            { description: 'NETFLIX.COM MONTHLY', amount: 15.99, type: 'debit' },
            { description: 'AMAZON.COM*MK3D2', amount: 127.43, type: 'debit' },
            { description: 'DIRECT DEP PAYROLL', amount: 3500.00, type: 'credit' },
            { description: 'UBER *TRIP NYC', amount: 23.45, type: 'debit' }
        ];
        
        const transactions = await Transaction.insertMany(
            transactionData.map(t => ({
                ...t,
                statementId: testStatement._id,
                userId: testStatement.userId,
                date: new Date(),
                originalDescription: t.description,
                currency: 'USD', // Add if required
                balance: 0 // Add if required
            }))
        );
        console.log(`✅ Created ${transactions.length} transactions\n`);
        
        // Enhance transactions
        console.log('🤖 Running Perplexity enhancement...');
        const result = await perplexityEnhancer.enhanceTransactions(testStatement._id);
        console.log(`✅ Enhanced ${result.enhanced} transactions\n`);
        
        // Check results
        const enhancedTransactions = await Transaction.find({ statementId: testStatement._id });
        console.log('📊 Enhancement Results:');
        enhancedTransactions.forEach(t => {
            console.log(`\n${t.originalDescription}:`);
            console.log(`  Category: ${t.category || 'Not set'}`);
            console.log(`  Merchant: ${t.merchant?.name || t.merchant || 'Not set'}`);
            console.log(`  Tags: ${t.tags?.join(', ') || 'None'}`);
        });
        
        // Check insights
        const updatedStatement = await Statement.findById(testStatement._id);
        if (updatedStatement.insights) {
            console.log('\n💡 Generated Insights:');
            console.log(JSON.stringify(updatedStatement.insights, null, 2));
        }
        
        // Cleanup
        console.log('\n🧹 Cleaning up test data...');
        await Transaction.deleteMany({ statementId: testStatement._id });
        await Statement.findByIdAndDelete(testStatement._id);
        console.log('✅ Cleanup complete');
        
    } catch (error) {
        console.error('❌ Test failed:', error.message);
        console.error(error.stack);
    } finally {
        await mongoose.disconnect();
        console.log('\n👋 Disconnected from MongoDB');
    }
}

testFullEnhancementReal().catch(console.error);