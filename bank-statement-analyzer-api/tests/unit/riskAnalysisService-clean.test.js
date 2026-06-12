import { test, expect, vi } from 'vitest';
import { RiskAnalysisService } from '../../src/services/riskAnalysisService.js';

vi.mock('../../src/models/TransactionCategory.js', () => {
  return {
    default: {
      findCachedCategory: vi.fn(async () => null),
      cacheCategory: vi.fn(async () => ({}))
    }
  };
});

test('Risk Analysis Service - Core Functions Work', async () => {
  const testService = new RiskAnalysisService();
  // Test data
  const testTransactions = [
    { amount: 100, description: 'Deposit', date: '2024-01-01' },
    { amount: -50, description: 'NSF FEE', date: '2024-01-02' }
  ];

  // Test calculateNSFCount
  const nsfResult = testService.calculateNSFCount(testTransactions);
  expect(nsfResult).toBe(1);

  // Test calculateTotalDepositsAndWithdrawals
  const totalsResult = testService.calculateTotalDepositsAndWithdrawals(testTransactions);
  expect(totalsResult.totalDeposits).toBe(100);
  expect(totalsResult.totalWithdrawals).toBe(50);

  // Test calculateAverageDailyBalance
  const balanceResult = testService.calculateAverageDailyBalance(testTransactions, 1000);
  expect(balanceResult.averageDailyBalance).toBeDefined();
  expect(balanceResult.periodDays).toBeDefined();

  // Test analyzeRisk (async)
  const riskResult = await testService.analyzeRisk(testTransactions, { openingBalance: 1000 });
  expect(riskResult).toHaveProperty('riskScore');
  expect(riskResult).toHaveProperty('riskLevel');
  expect(['VERY_LOW', 'LOW', 'MEDIUM', 'HIGH']).toContain(riskResult.riskLevel);
  expect(riskResult.totals.totalDeposits).toBe(100);
  expect(riskResult.totals.totalWithdrawals).toBe(50);
});
