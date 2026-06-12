import dotenv from 'dotenv';
import perplexityEnhancer from './src/services/perplexityEnhancementService.js';

dotenv.config();

async function testCategorization() {
    console.log('🏷️  Testing Transaction Categorization\n');
    
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
        }
    ];

    try {
        console.log('Sending transactions to Perplexity...\n');
        const results = await perplexityEnhancer.processBatch(testTransactions);
        
        console.log('📊 Categorization Results:');
        console.log('========================\n');
        
        results.forEach((result, index) => {
            const original = testTransactions[index];
            console.log(`Transaction ${index + 1}:`);
            console.log(`  Description: ${original.description}`);
            console.log(`  Amount: $${original.amount}`);
            console.log(`  → Category: ${result.category}`);
            console.log(`  → Merchant: ${result.merchant}`);
            console.log(`  → Tags: ${result.tags.join(', ') || 'None'}`);
            if (result.aiAnalysis) {
                console.log(`  → Confidence: ${(result.aiAnalysis.confidence * 100).toFixed(0)}%`);
                console.log(`  → Method: ${result.aiAnalysis.method}`);
            }
            console.log('');
        });
        
    } catch (error) {
        console.error('❌ Test failed:', error.message);
    }
}

testCategorization().catch(console.error);