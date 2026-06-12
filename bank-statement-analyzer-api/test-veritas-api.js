/**
 * Test the Enhanced Veritas Score API Endpoint
 * @license MIT
 */

import fetch from 'node-fetch';

// Start the server first if not already running
const BASE_URL = 'http://localhost:3001';
const API_KEY = 'your-api-key-here';

async function testVeritasEndpoint() {
  console.log('Testing Enhanced Veritas Score API Endpoint...\n');

  const testPayload = {
    nsfCount: 2,
    averageBalance: 1800,
    transactions: [
      { date: '2025-01-01', amount: 3000, type: 'credit', description: 'PAYROLL DEPOSIT ACME CORP' },
      { date: '2025-01-15', amount: 3000, type: 'credit', description: 'PAYROLL DEPOSIT ACME CORP' },
      { date: '2025-02-01', amount: 3000, type: 'credit', description: 'PAYROLL DEPOSIT ACME CORP' },
      { date: '2025-02-15', amount: 3000, type: 'credit', description: 'PAYROLL DEPOSIT ACME CORP' },
      { date: '2025-03-01', amount: 3000, type: 'credit', description: 'PAYROLL DEPOSIT ACME CORP' },
      { date: '2025-01-20', amount: 1500, type: 'credit', description: 'FREELANCE PAYMENT' },
      { date: '2025-02-10', amount: 800, type: 'credit', description: 'CONTRACTOR PAYMENT' },
      { date: '2025-01-02', amount: -1200, type: 'debit', description: 'RENT PAYMENT' },
      { date: '2025-01-05', amount: -350, type: 'debit', description: 'GROCERY STORE' },
      { date: '2025-02-02', amount: -1200, type: 'debit', description: 'RENT PAYMENT' }
    ]
  };

  try {
    const response = await fetch(`${BASE_URL}/api/analysis/veritas`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_KEY}`
      },
      body: JSON.stringify(testPayload)
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const result = await response.json();
    
    console.log('API Response:');
    console.log(JSON.stringify(result, null, 2));
    
    console.log('\nExtracted Results:');
    console.log('Success:', result.success);
    console.log('Message:', result.message);
    
    if (result.success && result.data) {
      console.log('Veritas Score:', result.data.veritasScore);
      console.log('Component Scores:');
      console.log('  NSF Score:', result.data.componentScores.nsfScore);
      console.log('  Balance Score:', result.data.componentScores.balanceScore);
      console.log('  Stability Score:', result.data.componentScores.stabilityScore);
      console.log('Score Interpretation:', result.data.scoreInterpretation.level);
      console.log('Recommendation:', result.data.scoreInterpretation.recommendation);
      
      if (result.data.incomeAnalysis) {
        console.log('Income Analysis:');
        console.log('  Total Income Transactions:', result.data.incomeAnalysis.totalIncomeTransactions);
        console.log('  Income Stability Score:', result.data.incomeAnalysis.stabilityScore);
        console.log('  Interpretation Level:', result.data.incomeAnalysis.interpretation.level);
        console.log('  Recommendations:', result.data.incomeAnalysis.recommendations);
      }
    }
    
  } catch (error) {
    console.error('Error testing API endpoint:', error.message);
    console.log('\nNote: Make sure the server is running with: npm start');
    console.log('If you see a connection error, start the server first.');
  }
}

// Run the test
testVeritasEndpoint().catch(console.error);
