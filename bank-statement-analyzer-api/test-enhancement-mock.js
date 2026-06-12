import dotenv from 'dotenv';
import perplexityEnhancer from './src/services/perplexityEnhancementService.js';

dotenv.config();

// Mock the database models for testing
const mockTransaction = {
    _id: '507f1f77bcf86cd799439011',
    statementId: '507f1f77bcf86cd799439012',
    userId: '507f1f77bcf86cd799439013',
    date: new Date('2025-06-15'),
    description: 'STARBUCKS STORE #12345',
    amount: 6.50,
    type: 'debit',
    originalDescription: 'STARBUCKS STORE #12345'
};

async function testEnhancementWithoutDB() {
    console.log('🧪 Testing Enhancement Without Database\n');
    
    try {
        // Test processBatch directly
        console.log('1️⃣ Testing processBatch method...\n');
        
        const testTransactions = [
            {
                _id: '1',
                description: 'STARBUCKS STORE #12345 NEW YORK NY',
                amount: 6.50,
                type: 'debit',
                date: new Date('2025-06-15')
            },
            {
                _id: '2',
                description: 'NETFLIX.COM MONTHLY SUBSCRIPTION',
                amount: 15.99,
                type: 'debit',
                date: new Date('2025-06-10')
            },
            {
                _id: '3',
                description: 'DIRECT DEPOSIT PAYROLL ACME CORP',
                amount: 2500.00,
                type: 'credit',
                date: new Date('2025-06-20')
            },
            {
                _id: '4',
                description: 'AMAZON.COM*2G4D93JK2 AMZN.COM/BILL',
                amount: 89.99,
                type: 'debit',
                date: new Date('2025-06-18')
            },
            {
                _id: '5',
                description: 'UBER *TRIP HELP.UBER.COM',
                amount: 23.45,
                type: 'debit',
                date: new Date('2025-06-22')
            }
        ];
        
        const startTime = Date.now();
        const enhancedBatch = await perplexityEnhancer.processBatch(testTransactions);
        const endTime = Date.now();
        
        console.log(`⏱️  Processing time: ${(endTime - startTime) / 1000}s\n`);
        console.log('📊 Enhanced Results:\n');
        
        enhancedBatch.forEach((result, index) => {
            const original = testTransactions[index];
            console.log(`Transaction ${index + 1}:`);
            console.log(`  📝 ${original.description}`);
            console.log(`  💰 $${original.amount.toFixed(2)} (${original.type})`);
            console.log(`  ✅ Category: ${result.category}`);
            console.log(`  🏪 Merchant: ${result.merchant}`);
            console.log(`  🏷️  Tags: ${result.tags?.join(', ') || 'None'}`);
            if (result.aiAnalysis) {
                console.log(`  🤖 AI Analysis: ${result.aiAnalysis.method} (${(result.aiAnalysis.confidence * 100).toFixed(0)}% confidence)`);
            }
            console.log('');
        });
        
        // Test generateStatementInsights method
        console.log('2️⃣ Testing insights generation...\n');
        
        // Mock the generateTransactionSummary data
        const mockSummaryData = testTransactions.map(t => ({
            ...t,
            category: enhancedBatch.find(e => e.transactionId === t._id)?.category || 'Other'
        }));
        
        const insightPrompt = `Analyze these financial transactions and provide 3 key insights:
        
Total Spending: $${testTransactions.filter(t => t.type === 'debit').reduce((sum, t) => sum + t.amount, 0).toFixed(2)}
Total Income: $${testTransactions.filter(t => t.type === 'credit').reduce((sum, t) => sum + t.amount, 0).toFixed(2)}

Categories found: ${[...new Set(enhancedBatch.map(e => e.category))].join(', ')}

Provide brief, actionable financial insights.`;

        console.log('Generating insights...');
        
        // Call Perplexity directly for insights
        const response = await fetch('https://api.perplexity.ai/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${process.env.PERPLEXITY_API_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: 'llama-3.1-sonar-small-128k-online',
                messages: [
                    {
                        role: 'system',
                        content: 'You are a personal financial advisor. Provide brief, actionable insights.'
                    },
                    {
                        role: 'user',
                        content: insightPrompt
                    }
                ],
                temperature: 0.3,
                max_tokens: 300
            })
        });
        
        if (response.ok) {
            const data = await response.json();
            console.log('\n💡 Financial Insights:');
            console.log(data.choices[0].message.content);
        }
        
        // Summary
        console.log('\n📈 Test Summary:');
        console.log('===============');
        const categories = {};
        enhancedBatch.forEach(e => {
            categories[e.category] = (categories[e.category] || 0) + 1;
        });
        
        console.log('Categories distribution:');
        Object.entries(categories).forEach(([cat, count]) => {
            console.log(`  • ${cat}: ${count} transaction${count > 1 ? 's' : ''}`);
        });
        
        const tags = enhancedBatch.flatMap(e => e.tags || []);
        const uniqueTags = [...new Set(tags)];
        if (uniqueTags.length > 0) {
            console.log('\nTags found:');
            uniqueTags.forEach(tag => {
                console.log(`  • ${tag}`);
            });
        }
        
        console.log('\n✅ Enhancement test completed successfully!');
        
    } catch (error) {
        console.error('\n❌ Test failed:', error.message);
        console.error(error.stack);
    }
}

// Run the test
testEnhancementWithoutDB().catch(console.error);