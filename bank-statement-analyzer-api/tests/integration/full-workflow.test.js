import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import supertest from 'supertest';
import jwt from 'jsonwebtoken';
import path from 'path';
import mongoose from 'mongoose';

let app;
let User;
let Statement;
let pdfParserService;

const SAMPLE_PARSE_RESULT = {
  metadata: {
    pageCount: 1,
    bankType: 'DEFAULT',
    parsed: new Date().toISOString()
  },
  accountInfo: {
    accountHolder: 'Test User',
    accountNumber: '****1234',
    bankName: 'Test Bank',
    statementPeriod: {
      start: '2024-01-01',
      end: '2024-01-31'
    }
  },
  balances: {
    opening: 1000,
    closing: 1500,
    available: 1500
  },
  transactions: [
    {
      date: '2024-01-05',
      description: 'Deposit',
      amount: 500,
      type: 'credit'
    },
    {
      date: '2024-01-10',
      description: 'Withdrawal',
      amount: -200,
      type: 'debit'
    }
  ]
};

describe('Full Workflow Integration Tests', () => {
  let api;
  let authToken;
  let testUser;
  let parseStatementSpy;

  beforeAll(async () => {
    vi.resetModules();

    ({ default: app } = await import('../../src/app.js'));

    // Ensure MongoDB connection is ready
    await mongoose.connection.asPromise();

    try {
      mongoose.deleteModel('User');
    } catch (error) {
      // Model might not exist yet; ignore cleanup error
    }

    try {
      mongoose.deleteModel('Statement');
    } catch (error) {
      // Model might not exist yet; ignore cleanup error
    }

    ({ default: User } = await import('../../src/models/User.js'));
    ({ default: Statement } = await import('../../src/models/Statement.js'));
    ({ default: pdfParserService } = await import('../../src/services/pdfParserService.js'));

    process.env.NODE_ENV = 'test';
    process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-key';

    parseStatementSpy = vi
      .spyOn(pdfParserService, 'parseStatement')
      .mockResolvedValue(SAMPLE_PARSE_RESULT);

    const createdUser = await User.create({
      email: 'workflow-user@example.com',
      password: 'Password123!',
      name: 'Workflow User'
    });

    let normalizedUser = Array.isArray(createdUser) ? createdUser[0] : createdUser;

    if (!normalizedUser?._id) {
      const fallbackId = new mongoose.Types.ObjectId();

      normalizedUser = {
        ...normalizedUser,
        _id: fallbackId,
        id: fallbackId.toString(),
        email: normalizedUser?.email || 'workflow-user@example.com',
        name: normalizedUser?.name || 'Workflow User'
      };
    }

    normalizedUser.id = normalizedUser.id || normalizedUser._id?.toString?.();
    testUser = normalizedUser;

    authToken = jwt.sign(
      {
        _id: testUser._id.toString(),
        email: testUser.email,
        name: testUser.name
      },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );

    api = supertest(app);
  });

  afterAll(async () => {
    if (testUser?._id) {
      await User.deleteOne({ _id: testUser._id });
    }

    await Statement.deleteMany({ userId: testUser?._id });
    parseStatementSpy?.mockRestore();
  });

  it('should process a complete statement analysis workflow', async () => {
    const pdfPath = path.join(process.cwd(), 'tests', 'fixtures', 'sample-statement.pdf');

    const uploadResponse = await api
      .post('/api/statements/upload')
      .set('Authorization', `Bearer ${authToken}`)
      .field('uploadId', 'test-upload')
      .field('statementDate', '2024-01-31')
      .field('accountNumber', '123456789')
      .field('bankName', 'Integration Test Bank')
      .attach('statement', pdfPath);

    expect(uploadResponse.status).toBe(201);
    expect(uploadResponse.body.success).toBe(true);
    expect(uploadResponse.body.data?.statement).toBeDefined();

    const statementId = uploadResponse.body.data.statement?._id;
    expect(statementId).toBeTruthy();

    const statementResponse = await api
      .get(`/api/statements/${statementId}`)
      .set('Authorization', `Bearer ${authToken}`);

    expect(statementResponse.status).toBe(200);
    expect(statementResponse.body.success).toBe(true);
    expect(statementResponse.body.data?.statement).toBeDefined();

    const statusResponse = await api
      .get(`/api/statements/${statementId}/analysis-status`)
      .set('Authorization', `Bearer ${authToken}`);

    expect(statusResponse.status).toBe(200);
    expect(statusResponse.body.success).toBe(true);
    expect(statusResponse.body.data?.status).toBeDefined();

    const analyticsResponse = await api
      .get(`/api/statements/${statementId}/analytics`)
      .set('Authorization', `Bearer ${authToken}`);

    expect(analyticsResponse.status).toBe(200);
    expect(analyticsResponse.body.success).toBe(true);
    expect(analyticsResponse.body.data?.analytics).toBeDefined();
  });
});
