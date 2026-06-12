import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { setupTestEnvironment, teardownTestEnvironment } from '../utils/testMocks.js';

vi.mock('../../src/services/pdfParserService.js', () => {
  const mockParseResult = {
    transactions: [
      {
        date: '2024-01-01',
        description: 'Mock Transaction',
        amount: 100.0
      }
    ],
    metadata: {
      accountHolder: 'Mock Account',
      accountNumber: '1234',
      bankName: 'Mock Bank',
      statementPeriod: {
        start: '2024-01-01',
        end: '2024-01-31'
      }
    }
  };

  class MockPDFParserService {
    parsePDF = vi.fn().mockResolvedValue(mockParseResult);
    parseStatement = vi.fn().mockResolvedValue(mockParseResult);
    validateStatement = vi.fn().mockResolvedValue(true);
  }

  const instance = new MockPDFParserService();

  return {
    __esModule: true,
    PDFParserService: MockPDFParserService,
    default: instance
  };
});

let app;

describe('Statement Endpoints', () => {
  beforeAll(async () => {
    ({ default: app } = await import('../../src/app.js'));
    setupTestEnvironment();
  });

  afterAll(() => {
    teardownTestEnvironment();
  });

  it('GET /api/statements should require authentication', async () => {
    const response = await request(app)
      .get('/api/statements')
      .expect(401);

    expect(response.body).toHaveProperty('error');
  });

  it('GET /health should work', async () => {
    const response = await request(app)
      .get('/health')
      .expect(200);

    expect(response.body).toHaveProperty('status');
  });
});