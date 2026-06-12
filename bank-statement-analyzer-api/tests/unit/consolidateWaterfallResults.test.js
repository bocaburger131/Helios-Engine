import { describe, it, expect } from 'vitest';
import StatementController from '../../src/controllers/statementController.js';
import Statement from '../../src/models/Statement.js';

const minimalHelios = {
  veritasScore: { score: 650, overall: 650, grade: 'B', rating: 'B' },
  riskAnalysis: { riskLevel: 'LOW', riskScore: 50, riskFactors: [] },
  incomeStabilityAnalysis: { stabilityScore: 70, stabilityLevel: 'GOOD' },
  financialSummary: {
    totalDeposits: 10000,
    totalWithdrawals: 5000,
    netChange: 5000,
    openingBalance: 1000
  },
  balanceAnalysis: { averageDailyBalance: 5000, periodDays: 90 },
  nsfAnalysis: { nsfCount: 0 },
  transactionSummary: { totalTransactions: 20 },
  waterfallMetadata: { duration: 1, timestamp: new Date() }
};

const externalSkipped = {
  executed: false,
  results: { middesk: null, isoftpull: null, sos: null, errors: [], totalCost: 0 },
  metadata: { duration: 0, totalCost: 0 }
};

const evaluation = {
  reason: 'test skip',
  costSaved: 0,
  metadata: { duration: 0 }
};

describe('consolidateWaterfallResults', () => {
  it('attaches forensicIntelligence when forensicContext includes transactions', () => {
    const result = StatementController.consolidateWaterfallResults(
      minimalHelios,
      externalSkipped,
      evaluation,
      {
        transactions: [
          { date: '2025-01-05', amount: 4000 },
          { date: '2025-02-05', amount: 3000 },
          { date: '2025-03-05', amount: 3500 }
        ],
        requestedLoanAmount: 50000,
        daysCovered: 90
      }
    );
    expect(result.forensicIntelligence).toBeDefined();
    expect(result.forensicIntelligence.window).toBeDefined();
    expect(result.forensicIntelligence.window.requestedLoanAmount).toBe(50000);
  });
});

describe('Statement analysis schema', () => {
  it('uses Mixed for analysis so nested forensicIntelligence is not stripped', () => {
    const p = Statement.schema.path('analysis');
    expect(p.instance).toBe('Mixed');
  });
});
