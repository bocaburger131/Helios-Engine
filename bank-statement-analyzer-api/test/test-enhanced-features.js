import fetch from 'node-fetch';
import fs from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const API_BASE = 'http://localhost:3001/api';

async function testEnhancedFeatures(statementId) {
  console.log('🧪 Testing Enhanced Features...\n');
  
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
        'Other': 500
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
      console.error('❌ PDF export failed:', await pdfResponse.text());
    }
    
    // Export as Excel
    const excelResponse = await fetch(`${API_BASE}/statements/${statementId}/export?format=excel`);
    if (excelResponse.ok) {
      const excelBuffer = await excelResponse.buffer();
      const excelPath = path.join(__dirname, `statement-${statementId}.xlsx`);
      fs.writeFileSync(excelPath, excelBuffer);
      console.log(`✅ Excel exported to: ${excelPath}`);
    } else {
      console.error('❌ Excel export failed:', await excelResponse.text());
    }
  } catch (error) {
    console.error('❌ Export failed:', error);
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
  const statementId = process.argv[2];
  
  if (!statementId) {
    console.error('❌ Please provide a statement ID as argument');
    console.log('Usage: node test/test-enhanced-features.js <statementId>');
    console.log('Example: node test/test-enhanced-features.js 1752541214634');
    process.exit(1);
  }
  
  // Check if server is running
  const serverRunning = await checkServer();
  if (!serverRunning) {
    process.exit(1);
  }
  
  // Run tests
  await testEnhancedFeatures(statementId);
}

main().catch(console.error);