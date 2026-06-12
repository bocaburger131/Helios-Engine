import dotenv from 'dotenv';
import mongoose from 'mongoose';
import perplexityEnhancer from './src/services/perplexityEnhancementService.js';
import Transaction from './src/models/Transaction.js';
import Statement from './src/models/Statement.js';

dotenv.config();

async function testFullEnhancement() {
    console.log('🚀 Testing Full Enhancement Flow\n');
    
    try {
        // Connect to MongoDB
        console.log('📦 Connecting to MongoDB...');
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('✅ Connected to MongoDB\n');
        
        // Create a test statement
        const testStatement = await Statement.create({
            userId: new mongoose.Types.ObjectId(),
            fileName: 'test-statement.pdf',
            fileSize: 1024,
            fileUrl: 'test-url',
            startDate: new Date('2025-06-01'),
            endDate: new Date('2025-06-30'),
            accountType: 'checking',
            status: 'processing',
            metadata: {
                uploadedAt: new Date(),
                source: 'test'
            }
        });
        console.log('✅ Created test statement:', testStatement._id);
        
        // Create test transactions
        const testTransactions = [
            {
                statementId: testStatement._id,
                userId: testStatement.userId,
                date: new Date('2025-06-15'),
                description: 'STARBUCKS STORE #12345',
                amount: 6.50,
                type: 'debit',
                originalDescription: 'STARBUCKS STORE #12345'
            },
            {
                statementId: testStatement._id,
                userId: testStatement.userId,
                date: new Date('2025-06-10'),
                description: 'NETFLIX.COM MONTHLY',
                amount: 15.99,
                type: 'debit',
                originalDescription: 'NETFLIX.COM MONTHLY'
            },
            {
                statementId: testStatement._id,
                userId: testStatement.userId,
                date: new Date('2025-06-20'),
                description: 'DIRECT DEPOSIT PAYROLL',
                amount: 2500.00,
                type: 'credit',
                originalDescription: 'DIRECT DEPOSIT PAYROLL'
            }
        ];
        
        const createdTransactions = await Transaction.insertMany(testTransactions);
        console.log(`✅ Created ${createdTransactions.length} test transactions\n`);
        
        // Run enhancement
        console.log('🤖 Running Perplexity enhancement...');
        const enhancementResult = await perplexityEnhancer.enhanceTransactions(testStatement._id);
        
        console.log('\n✨ Enhancement Results:');
        console.log(`  Enhanced ${enhancementResult.enhanced} transactions`);
        console.log(`  Insights generated: ${enhancementResult.insights ? 'Yes' : 'No'}`);
        
        // Fetch enhanced transactions
        const enhancedTransactions = await Transaction.find({ statementId: testStatement._id });
        console.log('\n📊 Enhanced Transaction Details:');
        enhancedTransactions.forEach((t, i) => {
            console.log(`\nTransaction ${i + 1}:`);
            console.log(`  Original: ${t.originalDescription}`);
            console.log(`  Category: ${t.category || 'Not set'}`);
            console.log(`  Merchant: ${t.merchant?.name || t.merchant || 'Not set'}`);
            console.log(`  Tags: ${t.tags?.join(', ') || 'None'}`);
            console.log(`  Verified: ${t.isVerified ? 'Yes' : 'No'}`);
        });
        
        // Fetch updated statement
        const updatedStatement = await Statement.findById(testStatement._id);
        if (updatedStatement.insights) {
            console.log('\n💡 Statement Insights:');
            console.log(JSON.stringify(updatedStatement.insights, null, 2));
        }
        
        // Cleanup
        console.log('\n🧹 Cleaning up test data...');
        await Transaction.deleteMany({ statementId: testStatement._id });
        await Statement.findByIdAndDelete(testStatement._id);
        console.log('✅ Test data cleaned up');
        
    } catch (error) {
        console.error('\n❌ Test failed:', error.message);
        console.error(error.stack);
    } finally {
        await mongoose.disconnect();
        console.log('\n👋 Disconnected from MongoDB');
    }
}

// Run the test
testFullEnhancement().catch(console.error);