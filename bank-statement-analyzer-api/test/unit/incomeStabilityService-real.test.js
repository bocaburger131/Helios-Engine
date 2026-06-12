// Test that bypasses global mocks by using vi.doUnmock
import { test, expect, vi, beforeAll } from 'vitest';

beforeAll(() => {
  // Unmock the specific service for this test
  vi.doUnmock('../../src/services/incomeStabilityService.js');
});

test('Income Stability Service - Real Implementation', async () => {
  // Re-import after unmocking
  const { default: IncomeStabilityService } = await import('../../src/services/incomeStabilityService.js');
  
  console.log('Type of service:', typeof IncomeStabilityService);
  console.log('Is function:', typeof IncomeStabilityService === 'function');
  
  const service = new IncomeStabilityService();
  
  console.log('Service instance:', service);
  console.log('Service constructor:', service.constructor.name);
  console.log('Income keywords defined:', !!service.incomeKeywords);
  console.log('Income keywords sample:', service.incomeKeywords?.slice(0, 3));
  
  // Test basic initialization
  expect(service.incomeKeywords).toBeDefined();
  expect(Array.isArray(service.incomeKeywords)).toBe(true);
  expect(service.incomeKeywords).toContain('payroll');
  expect(service.minIncomeAmount).toBe(50);
  expect(service.maxIncomeInterval).toBe(45);

  // Test data - realistic income transactions
  const testTransactions = [
    { amount: 2500, description: 'PAYROLL DEPOSIT', date: '2024-01-01' },
    { amount: 2500, description: 'PAYROLL DEPOSIT', date: '2024-01-15' },
    { amount: 2500, description: 'PAYROLL DEPOSIT', date: '2024-02-01' },
    { amount: -100, description: 'GROCERY STORE', date: '2024-01-02' },
    { amount: 500, description: 'FREELANCE PAYMENT', date: '2024-01-10' }
  ];

  // Test analyze method
  const result = service.analyze(testTransactions);
  expect(result).toBeDefined();
  expect(result.stabilityScore).toBeDefined();
  expect(typeof result.stabilityScore).toBe('number');
  
  console.log('Analysis result:', JSON.stringify(result, null, 2));
});
