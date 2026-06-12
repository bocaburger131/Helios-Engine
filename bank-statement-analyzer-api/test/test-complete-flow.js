import fetch from 'node-fetch';
import fs from 'fs';
import FormData from 'form-data';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const API_BASE = 'http://localhost:3001/api';

async function uploadTestStatement() {
  console.log('📤 Uploading test statement...');
  
  // Create a test statement file in CSV format
  const testContent = `Date,Description,Debit,Credit,Balance
2024-01-01,Opening Balance,,,1000.00
2024-01-05,Payroll Deposit,,2500.00,3500.00
2024-01-07,Grocery Store Mart,125.50,,3374.50
2024-01-10,Electric Company,85.00,,3289.50
2024-01-15,Online Shopping,199.99,,3089.51
2024-01-20,Gas Station,60.00,,3029.51
2024-01-22,Restaurant Dinner,45.75,,2983.76
2024-01-25,ATM Withdrawal,200.00,,2783.76
2024-01-28,Freelance Payment,,500.00,3283.76
2024-01-31,Closing Balance,,,3283.76`;

  const testFilePath = path.join(__dirname, 'test-statement.csv');
  fs.writeFileSync(testFilePath, testContent);

  try {
    const form = new FormData();
    form.append('statement', fs.createReadStream(testFilePath));
    
    const response = await fetch(`${API_BASE}/statements`, {
      method: 'POST',
      body: form,
      headers: form.getHeaders()
    });
    
    const result = await response.json();
    
    if (result.success) {
      console.log('✅ Statement uploaded successfully!');
      console.log(`📋 Statement ID: ${result.data.id}`);
      console.log(`📊 Transaction Count: ${result.data.transactionCount}`);
      console.log(`💰 Summary:`, result.data.summary);
      return result.data.id;
    } else {
      console.error('❌ Upload failed:', result.error);
      return null;
    }
  } finally {
    // Clean up test file
    if (fs.existsSync(testFilePath)) {
      fs.unlinkSync(testFilePath);
    }
  }
}

async function testEnhancedFeatures(statementId) {
  console.log(`\n🧪 Testing Enhanced Features with Statement ID: ${statementId}\n`);
  
  // Test 1: Search Transactions
  console.log('1️⃣ Testing Search...');
  try {
    const searchParams = new URLSearchParams({
      q: 'grocery',
      minAmount: 50,
      sortBy: 'amount-desc'
    });
    
    const searchResponse = await fetch(`${API_BASE}/statements/${statementId}/transactions/search?${searchParams}`);
    const searchResults = await searchResponse.json();
    console.log('✅ Search Results:', JSON.stringify(searchResults, null, 2));
  } catch (error) {
    console.error('❌ Search failed:', error);
  }
  
  // Test 2: Set Budget
  console.log('\n2️⃣ Testing Budget...');
  try {
    const budget = {
      totalMonthlyBudget: 3000,
      categories: {
        'Groceries': 500,
        'Utilities': 200,
        'Dining': 100,
        'Transportation': 300,
        'Entertainment': 200,
        'Shopping': 500,
        'Other': 200
      }
    };
    
    const budgetResponse = await fetch(`${API_BASE}/statements/${statementId}/budget`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(budget)
    });
    const budgetResult = await budgetResponse.json();
    console.log('✅ Budget Set:', JSON.stringify(budgetResult, null, 2));
    
    // Analyze budget
    const analysisResponse = await fetch(`${API_BASE}/statements/${statementId}/budget/analysis`);
    const budgetAnalysis = await analysisResponse.json();
    console.log('✅ Budget Analysis:', JSON.stringify(budgetAnalysis, null, 2));
  } catch (error) {
    console.error('❌ Budget operation failed:', error);
  }
  
  // Test 3: Export
  console.log('\n3️⃣ Testing Export...');
  try {
    // Export as PDF
    const pdfResponse = await fetch(`${API_BASE}/statements/${statementId}/export?format=pdf`);
    if (pdfResponse.ok) {
      const pdfBuffer = await pdfResponse.buffer();
      const pdfPath = path.join(__dirname, `statement-${statementId}.pdf`);
      fs.writeFileSync(pdfPath, pdfBuffer);
      console.log(`✅ PDF exported to: ${pdfPath}`);
    } else {
      const errorText = await pdfResponse.text();
      console.error('❌ PDF export failed:', errorText);
    }
    
    // Export as Excel
    const excelResponse = await fetch(`${API_BASE}/statements/${statementId}/export?format=excel`);
    if (excelResponse.ok) {
      const excelBuffer = await excelResponse.buffer();
      const excelPath = path.join(__dirname, `statement-${statementId}.xlsx`);
      fs.writeFileSync(excelPath, excelBuffer);
      console.log(`✅ Excel exported to: ${excelPath}`);
    } else {
      const errorText = await excelResponse.text();
      console.error('❌ Excel export failed:', errorText);
    }
  } catch (error) {
    console.error('❌ Export failed:', error);
  }
  
  // Test 4: Get Analysis
  console.log('\n4️⃣ Testing Analysis...');
  try {
    const analysisResponse = await fetch(`${API_BASE}/statements/${statementId}/analyze`);
    const analysis = await analysisResponse.json();
    console.log('✅ Analysis:', JSON.stringify(analysis, null, 2));
  } catch (error) {
    console.error('❌ Analysis failed:', error);
  }
  
  // Test 5: Get Insights
  console.log('\n5️⃣ Testing Insights...');
  try {
    const insightsResponse = await fetch(`${API_BASE}/statements/${statementId}/insights`);
    const insights = await insightsResponse.json();
    console.log('✅ Insights:', JSON.stringify(insights, null, 2));
  } catch (error) {
    console.error('❌ Insights failed:', error);
  }
  
  // Test 6: Get Categories
  console.log('\n6️⃣ Testing Categories...');
  try {
    const categoriesResponse = await fetch(`${API_BASE}/statements/${statementId}/categories`);
    const categories = await categoriesResponse.json();
    console.log('✅ Categories:', JSON.stringify(categories, null, 2));
  } catch (error) {
    console.error('❌ Categories failed:', error);
  }
  
  // Test 7: Get Transactions
  console.log('\n7️⃣ Testing Transactions List...');
  try {
    const transactionsResponse = await fetch(`${API_BASE}/statements/${statementId}/transactions`);
    const transactions = await transactionsResponse.json();
    console.log('✅ Transactions:', JSON.stringify(transactions, null, 2));
  } catch (error) {
    console.error('❌ Transactions failed:', error);
  }
}

// Check if server is running
async function checkServer() {
  try {
    const response = await fetch(`http://localhost:3001/health`);
    if (!response.ok) {
      throw new Error('Server health check failed');
    }
    return true;
  } catch (error) {
    console.error('❌ Server is not running. Please start it with: npm run dev');
    return false;
  }
}

// Main execution
async function main() {
  console.log('🏦 Bank Statement Analyzer - Complete Test Suite\n');
  
  // Check if server is running
  const serverRunning = await checkServer();
  if (!serverRunning) {
    process.exit(1);
  }
  
  // Upload a test statement
  const statementId = await uploadTestStatement();
  
  if (statementId) {
    // Test enhanced features with the uploaded statement
    await testEnhancedFeatures(statementId);
    
    console.log('\n✅ All tests completed!');
    console.log(`📋 Statement ID for future reference: ${statementId}`);
  } else {
    console.error('❌ Could not proceed with tests - no statement ID');
  }
}

main().catch(console.error);