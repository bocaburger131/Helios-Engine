import perplexityEnhancer from './src/services/perplexityEnhancementService.js';

async function testEnhancement() {
    console.log('🤖 Testing Perplexity Enhancement...\n');

    // Test transaction categorization
    const testTransactions = [
        {
            _id: 'test1',
            description: 'UBER TRIP HELP.UBER.COM',
            amount: 25.50,
            type: 'debit',
            date: new Date()
        },
        {
            _id: 'test2',
            description: 'NETFLIX.COM MONTHLY',
            amount: 15.99,
            type: 'debit',
            date: new Date()
        }
    ];

    console.log('Enhancing test transactions...');
    const enhanced = await perplexityEnhancer.processBatch(testTransactions);
    console.log('\nEnhanced results:');
    console.log(JSON.stringify(enhanced, null, 2));
}

testEnhancement().catch(console.error);