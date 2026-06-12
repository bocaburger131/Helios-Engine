/**
 * Test the enhanced Veritas Score endpoint with transaction data
 * @license MIT
 */

import { service as riskAnalysisService } from './src/services/riskAnalysisService.js';

// Test enhanced Veritas Score calculation with real transactions
async function testEnhancedVeritasScore() {
  console.log('Testing Enhanced Veritas Score with Transaction Data...\n');

  const testTransactions = [
    // Regular bi-weekly salary deposits
    { date: '2025-01-01', amount: 3000, type: 'credit', description: 'PAYROLL DEPOSIT ACME CORP' },
    { date: '2025-01-15', amount: 3000, type: 'credit', description: 'PAYROLL DEPOSIT ACME CORP' },
    { date: '2025-02-01', amount: 3000, type: 'credit', description: 'PAYROLL DEPOSIT ACME CORP' },
    { date: '2025-02-15', amount: 3000, type: 'credit', description: 'PAYROLL DEPOSIT ACME CORP' },
    { date: '2025-03-01', amount: 3000, type: 'credit', description: 'PAYROLL DEPOSIT ACME CORP' },
    
    // Some occasional freelance income
    { date: '2025-01-20', amount: 1500, type: 'credit', description: 'FREELANCE PAYMENT CLIENT A' },
    { date: '2025-02-10', amount: 800, type: 'credit', description: 'FREELANCE PAYMENT CLIENT B' },
    
    // Regular expenses
    { date: '2025-01-02', amount: -1200, type: 'debit', description: 'RENT PAYMENT' },
    { date: '2025-01-05', amount: -350, type: 'debit', description: 'GROCERY STORE' },
    { date: '2025-01-10', amount: -80, type: 'debit', description: 'UTILITIES' },
    { date: '2025-02-02', amount: -1200, type: 'debit', description: 'RENT PAYMENT' },
    { date: '2025-02-05', amount: -320, type: 'debit', description: 'GROCERY STORE' },
    { date: '2025-02-12', amount: -80, type: 'debit', description: 'UTILITIES' },
    { date: '2025-03-02', amount: -1200, type: 'debit', description: 'RENT PAYMENT' },
    { date: '2025-03-05', amount: -340, type: 'debit', description: 'GROCERY STORE' }
  ];

  // Test Case 1: Good financial health
  console.log('Test Case 1: Good Financial Health (Regular income, low NSF, good balance)');
  try {
    const result = riskAnalysisService.calculateVeritasScore({
      nsfCount: 1,
      averageBalance: 2500
    }, testTransactions);
    
    console.log('Veritas Score:', result.veritasScore);
    console.log('Component Scores:');
    console.log('  NSF Score:', result.componentScores.nsfScore);
    console.log('  Balance Score:', result.componentScores.balanceScore);
    console.log('  Stability Score:', result.componentScores.stabilityScore);
    console.log('Income Analysis:');
    console.log('  Total Income Transactions:', result.incomeAnalysis.totalIncomeTransactions);
    console.log('  Income Stability Score:', result.incomeAnalysis.stabilityScore);
    console.log('  Interpretation Level:', result.incomeAnalysis.interpretation.level);
    console.log('Recommendations:', result.incomeAnalysis.recommendations);
    console.log('Score Interpretation:', result.scoreInterpretation);
    console.log('');
  } catch (error) {
    console.error('Error in test case 1:', error.message);
  }

  // Test Case 2: Moderate financial health with irregular income
  console.log('Test Case 2: Moderate Financial Health (Irregular income, some NSFs)');
  const irregularTransactions = [
    { date: '2025-01-01', amount: 2000, type: 'credit', description: 'FREELANCE PROJECT PAYMENT' },
    { date: '2025-01-25', amount: 3500, type: 'credit', description: 'CONTRACTOR PAYMENT LARGE' },
    { date: '2025-02-18', amount: 1200, type: 'credit', description: 'FREELANCE SMALL PROJECT' },
    { date: '2025-03-10', amount: 4000, type: 'credit', description: 'CONSULTING WORK PAYMENT' },
    { date: '2025-03-28', amount: 800, type: 'credit', description: 'PART TIME JOB PAY' }
  ];
  
  try {
    const result = riskAnalysisService.calculateVeritasScore({
      nsfCount: 3,
      averageBalance: 1500
    }, irregularTransactions);
    
    console.log('Veritas Score:', result.veritasScore);
    console.log('Component Scores:');
    console.log('  NSF Score:', result.componentScores.nsfScore);
    console.log('  Balance Score:', result.componentScores.balanceScore);
    console.log('  Stability Score:', result.componentScores.stabilityScore);
    console.log('Income Analysis:');
    console.log('  Total Income Transactions:', result.incomeAnalysis.totalIncomeTransactions);
    console.log('  Income Stability Score:', result.incomeAnalysis.stabilityScore);
    console.log('  Interpretation Level:', result.incomeAnalysis.interpretation.level);
    console.log('Recommendations:', result.incomeAnalysis.recommendations);
    console.log('Score Interpretation:', result.scoreInterpretation);
    console.log('');
  } catch (error) {
    console.error('Error in test case 2:', error.message);
  }

  // Test Case 3: Poor financial health
  console.log('Test Case 3: Poor Financial Health (High NSF, low balance, minimal income)');
  const poorTransactions = [
    { date: '2025-01-15', amount: 1000, type: 'credit', description: 'PART TIME PAY' },
    { date: '2025-02-28', amount: 850, type: 'credit', description: 'PART TIME PAY' },
    { date: '2025-03-20', amount: 1200, type: 'credit', description: 'PART TIME PAY' }
  ];
  
  try {
    const result = riskAnalysisService.calculateVeritasScore({
      nsfCount: 8,
      averageBalance: 150
    }, poorTransactions);
    
    console.log('Veritas Score:', result.veritasScore);
    console.log('Component Scores:');
    console.log('  NSF Score:', result.componentScores.nsfScore);
    console.log('  Balance Score:', result.componentScores.balanceScore);
    console.log('  Stability Score:', result.componentScores.stabilityScore);
    console.log('Income Analysis:');
    console.log('  Total Income Transactions:', result.incomeAnalysis.totalIncomeTransactions);
    console.log('  Income Stability Score:', result.incomeAnalysis.stabilityScore);
    console.log('  Interpretation Level:', result.incomeAnalysis.interpretation.level);
    console.log('Recommendations:', result.incomeAnalysis.recommendations);
    console.log('Score Interpretation:', result.scoreInterpretation);
    console.log('');
  } catch (error) {
    console.error('Error in test case 3:', error.message);
  }
}

// Run the tests
testEnhancedVeritasScore().catch(console.error);
