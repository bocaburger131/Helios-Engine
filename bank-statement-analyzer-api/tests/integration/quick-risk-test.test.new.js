import { describe, it, expect, vi } from 'vitest';
import { RiskAnalysisService } from '../../src/services/riskAnalysisService.js';

describe('Risk Analysis Service Quick Test', () => {
  it('should import the service without errors', async () => {
    const riskAnalysisService = new RiskAnalysisService();
    
    expect(riskAnalysisService).toBeDefined();
    expect(typeof riskAnalysisService.calculateTotalDepositsAndWithdrawals).toBe('function');
    expect(typeof riskAnalysisService.calculateNSFCount).toBe('function');
    expect(typeof riskAnalysisService.analyzeRisk).toBe('function');
  });

  it('should calculate simple totals correctly', async () => {
    const riskAnalysisService = new RiskAnalysisService();
    
    const transactions = [
      { amount: 100 },
      { amount: -50 }
    ];
    
    const result = riskAnalysisService.calculateTotalDepositsAndWithdrawals(transactions);
    expect(result).toBeDefined();
    expect(result.totalDeposits).toBe(100);
    expect(result.totalWithdrawals).toBe(50);
  });

  it('should count NSF transactions correctly', async () => {
    const riskAnalysisService = new RiskAnalysisService();
    
    const transactions = [
      { description: 'NSF Fee', amount: -35 },
      { description: 'Regular Transaction', amount: -50 }
    ];
    
    const result = riskAnalysisService.calculateNSFCount(transactions);
    expect(result).toBe(1);
  });
});
