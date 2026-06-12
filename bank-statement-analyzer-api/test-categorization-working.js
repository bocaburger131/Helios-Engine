import dotenv from 'dotenv';
import perplexityEnhancer from './src/services/perplexityEnhancementService.js';

dotenv.config();

async function testCategorization() {
    console.log('🏷️  Testing Transaction Categorization with Working Model\n');
    console.log('Model: llama-3.1-sonar-small-128k-online\n');
    
    const testTransactions = [
        {
            _id: '1',
            description: 'STARBUCKS STORE #12345 NEW YORK NY',
            amount: 6.50,
            type: 'debit'
        },
        {
            _id: '2',
            description: 'NETFLIX.COM MONTHLY SUBSCRIPTION',
            amount: 15.99,
            type: 'debit'
        },
        {
            _id: '3',
            description: 'SHELL OIL 574298573 BROOKLYN NY',
            amount: 45.00,
            type: 'debit'
        },
        {
            _id: '4',
            description: 'AMAZON.COM AMZN.COM/BILL WA',
            amount: 127.89,
            type: 'debit'
        },
        {
            _id: '5',
            description: 'DIRECT DEP PAYROLL ACME CORP',
            amount: 3500.00,
            type: 'credit'
        },
        {
            _id: '6',
            description: 'WHOLEFDS BKN #10234 BROOKLYN NY',
            amount: 87.43,
            type: 'debit'
        },
        {
            _id: '7',
            description: 'UBER *TRIP HELP.UBER.COM CA',
            amount: 23.50,
            type: 'debit'
        },
        {
            _id: '8',
            description: 'SPOTIFY USA 877-778-1161 NY',
            amount: 9.99,
            type: 'debit'
        }
    ];

    try {
        console.log('Sending transactions to Perplexity AI...\n');
        const startTime = Date.now();
        const results = await perplexityEnhancer.processBatch(testTransactions);
        const endTime = Date.now();
        
        console.log(`⏱️  Processing time: ${(endTime - startTime) / 1000}s\n`);
        
        console.log('📊 Categorization Results:');
        console.log('========================\n');
        
        results.forEach((result, index) => {
            const original = testTransactions[index];
            console.log(`Transaction ${index + 1}:`);
            console.log(`  📝 Description: ${original.description}`);
            console.log(`  💰 Amount: $${original.amount.toFixed(2)} (${original.type})`);
            console.log(`  ✅ Category: ${result.category}`);
            console.log(`  🏪 Merchant: ${result.merchant}`);
            console.log(`  🏷️  Tags: ${result.tags?.length > 0 ? result.tags.join(', ') : 'None'}`);
            if (result.aiAnalysis) {
                console.log(`  📊 Confidence: ${(result.aiAnalysis.confidence * 100).toFixed(0)}%`);
                console.log(`  🤖 Method: ${result.aiAnalysis.method}`);
                if (result.aiAnalysis.model) {
                    console.log(`  🔧 Model: ${result.aiAnalysis.model}`);
                }
            }
            console.log('');
        });
        
        // Summary statistics
        console.log('📈 Summary:');
        console.log('==========');
        const categories = {};
        results.forEach(r => {
            categories[r.category] = (categories[r.category] || 0) + 1;
        });
        Object.entries(categories).forEach(([cat, count]) => {
            console.log(`  ${cat}: ${count} transaction${count > 1 ? 's' : ''}`);
        });
        
    } catch (error) {
        console.error('❌ Test failed:', error.message);
        console.error(error.stack);
    }
}

testCategorization().catch(console.error);