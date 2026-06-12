import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { LLMError } from '../../src/utils/errors.js';
import * as dbHandler from '../utils/db-handler.js';

const analyzeTextMock = vi.fn();
const statementFindMock = vi.fn();
const transactionAggregateMock = vi.fn();

const mockStatements = [
  {
    _id: '64f1e3d4c2b1a0f0a9b8c701',
    userId: '64f1e3d4c2b1a0f0a9b8c7d6',
    bankName: 'Test Credit Union',
    accountNumber: '9876543210',
    statementDate: new Date('2025-01-31T00:00:00.000Z'),
    createdAt: new Date('2025-02-01T00:00:00.000Z'),
    status: 'COMPLETED',
    riskScore: 720,
    alerts: [
      { severity: 'HIGH', isResolved: false, message: 'Cash flow volatility', recommendation: 'Monitor monthly spend' },
      { severity: 'CRITICAL', isResolved: false, message: 'NSF event detected', recommendation: 'Fund operating account' }
    ],
    analysis: {
      riskLevel: 'LOW',
      metrics: {
        nsf: { nsfCount: 1 },
        balance: { averageDailyBalance: 1500, netFlow: 500 },
        income: { netCashFlow: 500, averageMonthlyIncome: 8000 }
      }
    },
    analytics: { netCashFlow: 500, totalTransactions: 18 }
  }
];

vi.mock('../../src/models/Statement.js', () => ({
  default: {
    find: (...args) => statementFindMock(...args)
  }
}));

vi.mock('../../src/models/Transaction.js', () => ({
  default: {
    aggregate: (...args) => transactionAggregateMock(...args)
  }
}));

vi.mock('../../src/services/perplexityService.js', () => ({
  PerplexityService: class {
    analyzeText(text) {
      return analyzeTextMock(text);
    }
  }
}));

import app from '../../src/app.js';

const userId = '64f1e3d4c2b1a0f0a9b8c7d6';
const authToken = jwt.sign({ id: userId, email: 'vera@test.com' }, 'your-secret-key');

describe('Vera AI chat fallback behaviour', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    const queryChain = {
      sort: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      lean: vi.fn().mockResolvedValue(mockStatements)
    };

    statementFindMock.mockReturnValue(queryChain);

    transactionAggregateMock
      .mockResolvedValueOnce([
        {
          totalTransactions: 18,
          totalCredits: 65000,
          totalDebitsRaw: -42000,
          nsfEvents: 2
        }
      ])
      .mockResolvedValueOnce([
        {
          _id: { year: 2025, month: 1 },
          totalCredits: 65000,
          totalDebits: 42000,
          netFlow: 23000,
          transactionCount: 18
        }
      ]);

    analyzeTextMock.mockRejectedValue(new LLMError('Perplexity invalid model', 400));
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('returns portfolio summary fallback when Perplexity fails', async () => {
    const response = await request(app)
      .post('/api/statements/analysis/chat')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        question: 'Give me the overall financial health for this client.'
      })
      .expect(200);

    expect(analyzeTextMock).toHaveBeenCalledTimes(1);
    expect(transactionAggregateMock).toHaveBeenCalledTimes(2);

    expect(response.body.success).toBe(true);
    expect(response.body.data.ai.fallback).toBe(true);
    expect(response.body.data.answer).toContain('Overall financial health is rated');
    expect(response.body.data.statements).toHaveLength(1);
  });
});
