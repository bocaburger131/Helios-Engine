import dotenv from 'dotenv';

dotenv.config();

async function testPerplexityAuth() {
    console.log('🔐 Testing Perplexity API Key\n');
    
    const apiKey = process.env.PERPLEXITY_API_KEY;
    
    if (!apiKey) {
        console.error('❌ PERPLEXITY_API_KEY not found in .env');
        return;
    }
    
    console.log(`API Key: ${apiKey.substring(0, 10)}...${apiKey.substring(apiKey.length - 4)}`);
    console.log(`Length: ${apiKey.length} characters\n`);
    
    try {
        const response = await fetch('https://api.perplexity.ai/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: 'llama-3.1-sonar-small-128k-online',
                messages: [{ role: 'user', content: 'test' }],
                max_tokens: 10
            })
        });
        
        console.log(`Response status: ${response.status} ${response.statusText}`);
        
        if (response.status === 401) {
            console.error('\n❌ API Key is invalid or expired');
            console.log('\nTo fix:');
            console.log('1. Go to https://www.perplexity.ai/settings/api');
            console.log('2. Generate a new API key');
            console.log('3. Update PERPLEXITY_API_KEY in your .env file');
        } else if (response.ok) {
            console.log('✅ API Key is valid!');
        }
        
        const responseText = await response.text();
        console.log('\nResponse:', responseText.substring(0, 200));
        
    } catch (error) {
        console.error('❌ Request error:', error.message);
    }
}

testPerplexityAuth().catch(console.error);