import dotenv from 'dotenv';

dotenv.config();

async function testPerplexityAuth() {
    console.log('🔐 Testing Perplexity API Authentication\n');
    
    const apiKey = process.env.PERPLEXITY_API_KEY;
    
    // 1. Check API key format
    console.log('1️⃣ Checking API key...');
    if (!apiKey) {
        console.error('❌ PERPLEXITY_API_KEY not found in .env');
        return;
    }
    
    console.log(`✅ API Key found: ${apiKey.substring(0, 10)}...${apiKey.substring(apiKey.length - 4)}`);
    console.log(`   Length: ${apiKey.length} characters`);
    console.log(`   Starts with 'pplx-': ${apiKey.startsWith('pplx-') ? 'Yes' : 'No'}\n`);
    
    // 2. Test with correct models
    console.log('2️⃣ Testing with correct model names...');
    
    const models = [
        'llama-3.1-sonar-small-128k-online',
        'llama-3.1-sonar-large-128k-online',
        'llama-3.1-sonar-small-128k-chat',
        'llama-3.1-sonar-large-128k-chat',
        'llama-3.1-8b-instruct',
        'llama-3.1-70b-instruct'
    ];
    
    for (const model of models) {
        try {
            const response = await fetch('https://api.perplexity.ai/chat/completions', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    model: model,
                    messages: [{ 
                        role: 'user', 
                        content: 'Say "Model works!" if you can read this.' 
                    }],
                    max_tokens: 20,
                    temperature: 0.1
                })
            });
            
            if (response.ok) {
                const data = await response.json();
                console.log(`✅ Model ${model}: Working!`);
                console.log(`   Response: ${data.choices[0].message.content}\n`);
                
                // If this model works, let's do a more detailed test
                if (model.includes('online')) {
                    console.log('3️⃣ Testing transaction categorization with working model...\n');
                    await testCategorization(model, apiKey);
                    break;
                }
            } else {
                const error = await response.text();
                console.log(`❌ Model ${model}: ${response.status} - ${JSON.parse(error).error.message}`);
            }
        } catch (error) {
            console.log(`❌ Model ${model}: Error - ${error.message}`);
        }
    }
}

async function testCategorization(model, apiKey) {
    const testTransaction = {
        description: 'NETFLIX.COM MONTHLY SUBSCRIPTION',
        amount: 15.99
    };
    
    try {
        const response = await fetch('https://api.perplexity.ai/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: model,
                messages: [
                    {
                        role: 'system',
                        content: 'You are a financial transaction categorizer. Respond with JSON only.'
                    },
                    {
                        role: 'user',
                        content: `Categorize this transaction: "${testTransaction.description}" for $${testTransaction.amount}. 
                        Return JSON with: {"category": "...", "merchant": "...", "tags": [...]}`
                    }
                ],
                temperature: 0.1,
                max_tokens: 100
            })
        });
        
        if (response.ok) {
            const data = await response.json();
            console.log('Transaction categorization response:');
            console.log(data.choices[0].message.content);
            console.log('\n✅ API is fully functional with model:', model);
        }
    } catch (error) {
        console.error('Categorization test error:', error);
    }
}

testPerplexityAuth().catch(console.error);