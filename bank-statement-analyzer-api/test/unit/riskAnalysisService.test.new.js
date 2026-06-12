import { describe, it, expect, beforeEach, vi } from 'vitest';

// Force test environment
process.env.NODE_ENV = 'test';

// Mock modules
vi.mock('../../src/utils/logger.js', async () => {
  const mockLogger = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn()
  };
  return { default: mockLogger };
});

// Import actual service
import { RiskAnalysisService } from '../../src/services/riskAnalysisService.js';

describe('RiskAnalysisService', () => {
  let riskAnalysisService;

  beforeEach(() => {
    riskAnalysisService = new RiskAnalysisService();
    vi.clearAllMocks();
  });

  describe('calculateTotalDepositsAndWithdrawals', () => {
    it('should calculate correct totals for mixed transactions', () => {
      const transactions = [
        { date: '2024-01-01', description: 'Payroll', amount: 2500.00 },
        { date: '2024-01-02', description: 'Grocery Store', amount: -125.50 },
        { date: '2024-01-03', description: 'ATM Withdrawal', amount: -200.00 },
        { date: '2024-01-04', description: 'Refund', amount: 50.25 },
        { date: '2024-01-05', description: 'Electric Bill', amount: -150.75 }
      ];

      const result = riskAnalysisService.calculateTotalDepositsAndWithdrawals(transactions);
      expect(result).toBeDefined();
      expect(result.totalDeposits).toBe(2550.25);
      expect(result.totalWithdrawals).toBe(476.25);
    });

    it('should handle empty array', () => {
      const result = riskAnalysisService.calculateTotalDepositsAndWithdrawals([]);
      expect(result).toBeDefined();
      expect(result.totalDeposits).toBe(0);
      expect(result.totalWithdrawals).toBe(0);
    });

    it('should throw error for non-array input', () => {
      expect(() => riskAnalysisService.calculateTotalDepositsAndWithdrawals(null)).toThrow('Transactions must be an array');
      expect(() => riskAnalysisService.calculateTotalDepositsAndWithdrawals(undefined)).toThrow('Transactions must be an array');
      expect(() => riskAnalysisService.calculateTotalDepositsAndWithdrawals({})).toThrow('Transactions must be an array');
    });
  });

  describe('calculateNSFCount', () => {
    it('should correctly count NSF transactions', () => {
      const transactions = [
        { date: '2024-01-01', description: 'NSF Fee', amount: -35.00 },
        { date: '2024-01-02', description: 'Normal Transaction', amount: -50.00 },
        { date: '2024-01-03', description: 'Insufficient Funds Fee', amount: -35.00 },
        { date: '2024-01-04', description: 'Another Transaction', amount: -75.00 },
        { date: '2024-01-05', description: 'Returned Item Fee', amount: -35.00 }
      ];

      const nsfCount = riskAnalysisService.calculateNSFCount(transactions);
      expect(nsfCount).toBe(3);
    });

    it('should return 0 for no NSF transactions', () => {
      const transactions = [
        { date: '2024-01-01', description: 'Normal Transaction', amount: -50.00 },
        { date: '2024-01-02', description: 'Another Transaction', amount: -75.00 }
      ];

      const nsfCount = riskAnalysisService.calculateNSFCount(transactions);
      expect(nsfCount).toBe(0);
    });

    it('should handle empty array', () => {
      const nsfCount = riskAnalysisService.calculateNSFCount([]);
      expect(nsfCount).toBe(0);
    });

    it('should throw error for non-array input', () => {
      expect(() => riskAnalysisService.calculateNSFCount(null)).toThrow('Transactions must be an array');
      expect(() => riskAnalysisService.calculateNSFCount(undefined)).toThrow('Transactions must be an array');
      expect(() => riskAnalysisService.calculateNSFCount({})).toThrow('Transactions must be an array');
    });
  });

  describe('calculateAverageDailyBalance', () => {
    it('should calculate correct average daily balance', () => {
      const transactions = [
        { date: '2024-01-01', description: 'Initial Balance', amount: 1000.00 },
        { date: '2024-01-02', description: 'Withdrawal', amount: -200.00 },
        { date: '2024-01-03', description: 'Deposit', amount: 300.00 },
        { date: '2024-01-04', description: 'Withdrawal', amount: -150.00 }
      ];

      const result = riskAnalysisService.calculateAverageDailyBalance(transactions, 500);
      expect(result).toBeDefined();
      expect(result.averageDailyBalance).toBeGreaterThan(0);
      expect(result.periodDays).toBeGreaterThan(0);
    });

    it('should handle empty transactions array', () => {
      const result = riskAnalysisService.calculateAverageDailyBalance([], 1000);
      expect(result).toBeDefined();
      expect(result.averageDailyBalance).toBe(1000);
      expect(result.periodDays).toBe(0);
    });

    it('should throw error for invalid opening balance', () => {
      expect(() => riskAnalysisService.calculateAverageDailyBalance([], 'invalid')).toThrow('Opening balance must be a number');
      expect(() => riskAnalysisService.calculateAverageDailyBalance([], null)).toThrow('Opening balance must be a number');
      expect(() => riskAnalysisService.calculateAverageDailyBalance([], undefined)).toThrow('Opening balance must be a number');
    });
  });

  describe('analyzeRisk', () => {
    it('should analyze risk correctly for normal transactions', () => {
      const transactions = [
        { date: '2024-01-01', description: 'Payroll', amount: 3000.00 },
        { date: '2024-01-02', description: 'Rent', amount: -1500.00 },
        { date: '2024-01-03', description: 'Utilities', amount: -200.00 },
        { date: '2024-01-04', description: 'Groceries', amount: -300.00 }
      ];

      const result = riskAnalysisService.analyzeRisk(transactions, 1000);
      expect(result).toBeDefined();
      expect(result.riskScore).toBeGreaterThanOrEqual(0);
      expect(result.riskScore).toBeLessThanOrEqual(100);
      expect(['VERY_LOW', 'LOW', 'MEDIUM', 'HIGH']).toContain(result.riskLevel);
    });

    it('should indicate high risk for multiple NSF transactions', () => {
      const transactions = [
        { date: '2024-01-01', description: 'NSF Fee', amount: -35.00 },
        { date: '2024-01-02', description: 'Insufficient Funds Fee', amount: -35.00 },
        { date: '2024-01-03', description: 'Returned Item Fee', amount: -35.00 }
      ];

      const result = riskAnalysisService.analyzeRisk(transactions, 0);
      expect(result.riskScore).toBeGreaterThanOrEqual(80);
      expect(result.riskLevel).toBe('HIGH');
    });

    it('should handle empty transactions array', () => {
      const result = riskAnalysisService.analyzeRisk([], 1000);
      expect(result).toBeDefined();
      expect(result.riskScore).toBeGreaterThanOrEqual(0);
      expect(result.riskScore).toBeLessThanOrEqual(100);
      expect(['VERY_LOW', 'LOW', 'MEDIUM', 'HIGH']).toContain(result.riskLevel);
    });
  });
});
