import dotenv from 'dotenv';
import mongoose from 'mongoose';

dotenv.config();

async function testPerplexityIntegration() {
    console.log('🧪 Complete Perplexity Integration Test\n');
    console.log('=====================================\n');

    // 1. Check environment
    console.log('1️⃣ Checking environment variables...');
    const apiKey = process.env.PERPLEXITY_API_KEY;
    if (!apiKey) {
        console.error('❌ PERPLEXITY_API_KEY not found in .env file!');
        console.log('\nPlease add to your .env file:');
        console.log('PERPLEXITY_API_KEY=your-api-key-here\n');
        return;
    }
    console.log('✅ Perplexity API key found\n');

    // 2. Test basic API connection
    console.log('2️⃣ Testing Perplexity API connection...');
    try {
        const testResponse = await fetch('https://api.perplexity.ai/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: 'sonar-deep-research', // Updated to sonar-deep-research
                messages: [
                    {
                        role: 'user',
                        content: 'Say "API is working" if you can read this.'
                    }
                ],
                temperature: 0.1,
                max_tokens: 50
            })
        });

        if (!testResponse.ok) {
            const error = await testResponse.text();
            throw new Error(`API Error: ${testResponse.status} - ${error}`);
        }

        const data = await testResponse.json();
        console.log('✅ API Connection successful:', data.choices[0].message.content);
    } catch (error) {
        console.error('❌ API Connection failed:', error.message);
        return;
    }

    // 3. Test transaction categorization
    console.log('\n3️⃣ Testing transaction categorization...');
    
    // Import the service (create a mock if the file doesn't exist)
    let perplexityEnhancer;
    try {
        const module = await import('./src/services/perplexityEnhancementService.js');
        perplexityEnhancer = module.default;
    } catch (error) {
        console.log('⚠️  Service file not found, using inline test...');
        perplexityEnhancer = {
            processBatch: async (transactions) => {
                // Direct API call for testing
                const prompt = `Categorize these transactions. Return JSON with category, merchant, and tags for each:
${JSON.stringify(transactions.map(t => ({
    id: t._id,
    description: t.description,
    amount: t.amount
})), null, 2)}`;

                const response = await fetch('https://api.perplexity.ai/chat/completions', {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${apiKey}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        model: 'sonar-deep-research', // Updated model
                        messages: [
                            {
                                role: 'system',
                                content: 'You are a financial transaction categorizer. Respond only with valid JSON.'
                            },
                            {
                                role: 'user',
                                content: prompt
                            }
                        ],
                        temperature: 0.1,
                        max_tokens: 500
                    })
                });

                const data = await response.json();
                return JSON.parse(data.choices[0].message.content);
            }
        };
    }

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
        },
        {
            _id: 'test3',
            description: 'WHOLE FOODS MKT #10456',
            amount: 87.23,
            type: 'debit',
            date: new Date()
        },
        {
            _id: 'test4',
            description: 'DIRECT DEPOSIT PAYROLL',
            amount: 2500.00,
            type: 'credit',
            date: new Date()
        },
        {
            _id: 'test5',
            description: 'AMAZON WEB SERVICES',
            amount: 142.76,
            type: 'debit',
            date: new Date()
        }
    ];

    try {
        console.log('\nProcessing transactions...');
        const enhanced = await perplexityEnhancer.processBatch(testTransactions);
        
        console.log('\n📊 Enhanced Results:');
        console.log('===================\n');
        
        if (Array.isArray(enhanced)) {
            enhanced.forEach((result, index) => {
                const original = testTransactions[index];
                console.log(`Transaction ${index + 1}:`);
                console.log(`  Original: ${original.description} - $${original.amount}`);
                console.log(`  Category: ${result.category || 'N/A'}`);
                console.log(`  Merchant: ${result.merchant?.name || result.merchant || 'N/A'}`);
                console.log(`  Tags: ${Array.isArray(result.tags) ? result.tags.join(', ') : 'None'}`);
                console.log('');
            });
        } else {
            console.log(JSON.stringify(enhanced, null, 2));
        }
    } catch (error) {
        console.error('❌ Enhancement failed:', error.message);
    }

    // 4. Test insights generation
    console.log('\n4️⃣ Testing insights generation...');
    try {
        const insightPrompt = `Analyze these transactions and provide 3 key insights:
- Total spending: $${testTransactions.filter(t => t.type === 'debit').reduce((sum, t) => sum + t.amount, 0).toFixed(2)}
- Income: $${testTransactions.filter(t => t.type === 'credit').reduce((sum, t) => sum + t.amount, 0).toFixed(2)}
- Categories: Transportation, Entertainment, Groceries, Income, Technology`;

        const response = await fetch('https://api.perplexity.ai/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: 'sonar-deep-research', // Updated model
                messages: [
                    {
                        role: 'user',
                        content: insightPrompt
                    }
                ],
                temperature: 0.3,
                max_tokens: 200
            })
        });

        const data = await response.json();
        console.log('✅ Insights generated:');
        console.log(data.choices[0].message.content);
    } catch (error) {
        console.error('❌ Insights generation failed:', error.message);
    }

    console.log('\n✨ Test complete!');
}

// Run the test
testPerplexityIntegration().catch(console.error);