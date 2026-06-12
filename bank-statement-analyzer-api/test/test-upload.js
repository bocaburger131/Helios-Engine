import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import FormData from 'form-data';
import fetch from 'node-fetch';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT || 3001;
const API_BASE_URL = `http://localhost:${PORT}/api`;
const SERVER_URL = `http://localhost:${PORT}`;

async function testUpload() {
  try {
    // Use the test file we created
    const testFilePath = path.join(__dirname, '..', 'test-statement.txt');
    
    if (!fs.existsSync(testFilePath)) {
      console.log('Creating test file...');
      const testContent = `BANK STATEMENT
Account Number: 123456789
Statement Period: 01/01/2024 - 01/31/2024

Beginning Balance: $1,000.00

Date        Description                     Amount      Balance
01/05/2024  Direct Deposit - Salary         +2,500.00   3,500.00
01/10/2024  Grocery Store                   -150.00     3,350.00
01/15/2024  Electric Bill                   -120.00     3,230.00
01/20/2024  ATM Withdrawal                  -200.00     3,030.00
01/25/2024  Restaurant                      -45.00      2,985.00

Ending Balance: $2,985.00`;
      
      fs.writeFileSync(testFilePath, testContent, 'utf8');
    }

    const formData = new FormData();
    formData.append('statement', fs.createReadStream(testFilePath));

    console.log('📤 Uploading test file...');
    
    const response = await fetch(`${API_BASE_URL}/statements`, {
      method: 'POST',
      body: formData,
      headers: formData.getHeaders()
    });

    const result = await response.json();
    
    if (response.ok) {
      console.log('✅ Upload successful!');
      console.log(JSON.stringify(result, null, 2));
      
      // Test the analysis endpoint if we got an ID
      if (result.data && result.data.id) {
        console.log('\n📊 Testing analysis endpoint...');
        await testAnalysis(result.data.id);
      }
    } else {
      console.error('❌ Upload failed:', result);
    }

  } catch (error) {
    console.error('❌ Test error:', error);
  }
}

async function testAnalysis(statementId) {
  try {
    const response = await fetch(`${API_BASE_URL}/statements/${statementId}/analyze`);
    const analysis = await response.json();
    
    if (response.ok) {
      console.log('✅ Analysis successful!');
      console.log(JSON.stringify(analysis, null, 2));
    } else {
      console.error('❌ Analysis failed:', analysis);
    }
  } catch (error) {
    console.error('❌ Analysis error:', error);
  }
}

// Test server health first
async function testHealth() {
  try {
    console.log(`🔍 Checking server health at ${SERVER_URL}/health...`);
    const response = await fetch(`${SERVER_URL}/health`);
    const result = await response.json();
    console.log('🟢 Server health:', result);
    return true;
  } catch (error) {
    console.error('🔴 Server not running or health check failed:', error.message);
    console.log('Please start the server with: npm run dev');
    return false;
  }
}

// Main test function
async function runTests() {
  console.log('🚀 Starting upload tests...\n');
  
  // Check if server is running
  const serverUp = await testHealth();
  if (!serverUp) {
    return;
  }
  
  console.log('\n📤 Testing file upload...');
  await testUpload();
}

runTests();