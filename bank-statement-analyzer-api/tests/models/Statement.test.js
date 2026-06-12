import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

// Unmock the Statement model for this test file
vi.unmock('../../src/models/Statement.js');

// Use the global db connection, remove local beforeAll/afterAll
describe('Statement Model Tests', () => {
  let Statement;

  beforeAll(async () => {
    // Import model after connection is established by global setup
    Statement = (await import('../../src/models/Statement.js')).default;
  });

  it('should create a valid statement', async () => {
    const statementData = {
      user: new mongoose.Types.ObjectId(), // Correctly use 'user'
      uploadId: 'test_upload_' + Date.now(),
      accountNumber: '123456789',
      bankName: 'Test Bank',
      statementDate: new Date(),
      fileName: 'test-statement.pdf',
      fileUrl: 'https://example.com/test-statement.pdf',
      openingBalance: 1000.00,
      closingBalance: 1500.00,
      status: 'PENDING',
      originalName: 'Bank Statement Jan 2023.pdf',
      metadata: {
        mimetype: 'application/pdf',
        size: 1024000,
        pages: 5
      },
      analytics: {
        totalTransactions: 10,
        totalIncome: 5000,
        totalExpenses: 3000,
        netCashFlow: 2000,
        averageBalance: 2000
      }
    };

    const statement = new Statement(statementData);
    const savedStatement = await statement.save();

    expect(savedStatement._id).toBeDefined();
    expect(savedStatement.fileName).toBe(statementData.fileName);
    expect(savedStatement.status).toBe('PENDING');
  });

  it('should fail without required fields', async () => {
    const statement = new Statement({});
    let error;
    try {
      await statement.save();
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(mongoose.Error.ValidationError);
    expect(error.errors).toHaveProperty('user');
  });
});