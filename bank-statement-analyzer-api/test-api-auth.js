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
    
    // 2. Test with a simple request
    console.log('2️⃣ Testing API connection...');
    
    try {
        const response = await fetch('https://api.perplexity.ai/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify({
                model: 'sonar-medium-online', // Try a different model
                messages: [
                    {
                        role: 'user',
                        content: 'Hello, please respond with "API working"'
                    }
                ],
                temperature: 0.1,
                max_tokens: 50
            })
        });

        console.log(`Response status: ${response.status} ${response.statusText}`);
        console.log(`Response headers:`, Object.fromEntries(response.headers.entries()));
        
        const responseText = await response.text();
        console.log('\nResponse body:');
        console.log(responseText.substring(0, 500) + (responseText.length > 500 ? '...' : ''));
        
        if (response.ok) {
            const data = JSON.parse(responseText);
            console.log('\n✅ API is working!');
            console.log('Response:', data.choices[0].message.content);
        } else {
            console.log('\n❌ API request failed');
        }
        
    } catch (error) {
        console.error('❌ Request error:', error.message);
    }
    
    // 3. Try different models
    console.log('\n3️⃣ Testing available models...');
    const models = ['sonar-small-online', 'sonar-medium-online', 'sonar-small-chat', 'sonar-medium-chat'];
    
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
                    messages: [{ role: 'user', content: 'test' }],
                    max_tokens: 10
                })
            });
            
            console.log(`Model ${model}: ${response.ok ? '✅ Available' : `❌ ${response.status}`}`);
        } catch (error) {
            console.log(`Model ${model}: ❌ Error`);
        }
    }
}

testPerplexityAuth().catch(console.error);