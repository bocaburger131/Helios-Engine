import fetch from 'node-fetch';

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function testZohoEndpoint() {
  try {
    console.log('Waiting 10 seconds for the server to fully initialize...');
    await delay(10000);

    console.log('Sending request to the server...');
    const response = await fetch('http://localhost:3002/api/zoho/start-analysis', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': 'demo-api-key-1'
      },
      body: JSON.stringify({
        dealId: '5929702000006824001',
        metadata: {
          requestedBy: 'local-debug',
          priority: 'medium'
        },
        options: {
          notify: false
        }
      })
    });

    console.log('Status:', response.status);
    const data = await response.text();
    console.log('Response:', data);
  } catch (error) {
    console.error('Detailed Error:', error);
  } finally {
    console.log('Test script finished execution.');
  }
}

testZohoEndpoint();