import dotenv from 'dotenv';
import mongoose from 'mongoose';
import perplexityEnhancer from './src/services/perplexityEnhancementService.js';
import Transaction from './src/models/Transaction.js';
import Statement from './src/models/Statement.js';

dotenv.config();

async function testFullEnhancementFinal() {
    console.log('🚀 Testing Full Enhancement with Real Database\n');
    
    try {
        // Connect to MongoDB
        console.log('📦 Connecting to MongoDB...');
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('✅ Connected to MongoDB\n');
        
        // Create a test statement with ALL required fields
        console.log('Creating test statement...');
        const testStatement = await Statement.create({
            userId: new mongoose.Types.ObjectId(),
            fileName: 'test-statement-july2025.pdf',
            fileSize: 2048,
            fileUrl: 'https://example.com/test-statement.pdf',
            mimeType: 'application/pdf',
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
            { description: 'STARBUCKS #12345 NYC', amount: 5.75, type: 'debit', date: new Date('2025-07-05') },
            { description: 'NETFLIX.COM MONTHLY', amount: 15.99, type: 'debit', date: new Date('2025-07-10') },
            { description: 'AMAZON.COM*MK3D2', amount: 127.43, type: 'debit', date: new Date('2025-07-12') },
            { description: 'DIRECT DEP PAYROLL', amount: 3500.00, type: 'credit', date: new Date('2025-07-15') },
            { description: 'UBER *TRIP NYC', amount: 23.45, type: 'debit', date: new Date('2025-07-18') }
        ];
        
        const transactions = await Transaction.insertMany(
            transactionData.map(t => ({
                ...t,
                statementId: testStatement._id,
                userId: testStatement.userId,
                originalDescription: t.description,
                currency: 'USD',
                balance: 0
            }))
        );
        console.log(`✅ Created ${transactions.length} transactions\n`);
        
        // Enhance transactions
        console.log('🤖 Running Perplexity enhancement...');
        const result = await perplexityEnhancer.enhanceTransactions(testStatement._id);
        console.log(`✅ Enhanced ${result.enhanced} transactions`);
        
        if (result.insights) {
            console.log('✅ Generated insights\n');
        }
        
        // Check results
        const enhancedTransactions = await Transaction.find({ statementId: testStatement._id })
            .sort({ date: 1 });
        
        console.log('📊 Enhancement Results:');
        console.log('=======================');
        
        // Calculate totals
        let totalIncome = 0;
        let totalExpenses = 0;
        
        enhancedTransactions.forEach(t => {
            console.log(`\n${t.description || t.originalDescription}:`);
            console.log(`  📅 Date: ${t.date.toLocaleDateString()}`);
            console.log(`  💰 Amount: $${t.amount.toFixed(2)} (${t.type})`);
            console.log(`  📁 Category: ${t.category || 'Not set'}`);
            console.log(`  🏪 Merchant: ${t.merchant?.name || t.merchant || 'Not set'}`);
            console.log(`  🏷️  Tags: ${t.tags?.length > 0 ? t.tags.join(', ') : 'None'}`);
            console.log(`  ✅ Verified: ${t.isVerified ? 'Yes' : 'No'}`);
            
            if (t.type === 'credit') {
                totalIncome += t.amount;
            } else {
                totalExpenses += t.amount;
            }
        });
        
        // Show financial summary
        console.log('\n💰 Financial Summary:');
        console.log('====================');
        console.log(`Total Income:    $${totalIncome.toFixed(2)}`);
        console.log(`Total Expenses:  $${totalExpenses.toFixed(2)}`);
        console.log(`Net Cash Flow:   $${(totalIncome - totalExpenses).toFixed(2)}`);
        
        // Check insights
        const updatedStatement = await Statement.findById(testStatement._id);
        if (updatedStatement.insights) {
            console.log('\n💡 Generated Insights:');
            console.log('=====================');
            if (typeof updatedStatement.insights === 'object' && updatedStatement.insights.insights) {
                console.log(updatedStatement.insights.insights);
            } else if (typeof updatedStatement.insights === 'string') {
                console.log(updatedStatement.insights);
            } else {
                console.log(JSON.stringify(updatedStatement.insights, null, 2));
            }
        }
        
        // Show category distribution
        const categoryCount = {};
        enhancedTransactions.forEach(t => {
            if (t.category) {
                categoryCount[t.category] = (categoryCount[t.category] || 0) + 1;
            }
        });
        
        console.log('\n📊 Category Distribution:');
        console.log('========================');
        Object.entries(categoryCount).forEach(([category, count]) => {
            console.log(`${category}: ${count} transaction${count > 1 ? 's' : ''}`);
        });
        
        // Show recurring transactions
        const recurringTransactions = enhancedTransactions.filter(t => 
            t.tags && (t.tags.includes('subscription') || t.tags.includes('recurring'))
        );
        
        if (recurringTransactions.length > 0) {
            console.log('\n🔄 Recurring/Subscription Transactions:');
            console.log('======================================');
            recurringTransactions.forEach(t => {
                console.log(`• ${t.merchant || t.description}: $${t.amount.toFixed(2)}/month`);
            });
        }
        
        console.log('\n✅ Enhancement test completed successfully!');
        
        // Cleanup
        console.log('\n🧹 Cleaning up test data...');
        await Transaction.deleteMany({ statementId: testStatement._id });
        await Statement.findByIdAndDelete(testStatement._id);
        console.log('✅ Cleanup complete');
        
    } catch (error) {
        console.error('❌ Test failed:', error.message);
        if (error.errors) {
            Object.keys(error.errors).forEach(key => {
                console.error(`  - ${key}: ${error.errors[key].message}`);
            });
        }
    } finally {
        await mongoose.disconnect();
        console.log('\n👋 Disconnected from MongoDB');
    }
}

testFullEnhancementFinal().catch(console.error);