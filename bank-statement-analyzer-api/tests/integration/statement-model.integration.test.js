import { describe, it, expect } from 'vitest';
import mongoose from 'mongoose';

// Import the actual Statement model directly
import Statement from '../../src/models/Statement.js';

// Use the global db connection, remove local beforeAll/afterAll
describe('Statement Model Integration Tests', () => {

  it('should create a valid statement with all required fields', async () => {
    const statementData = {
      user: new mongoose.Types.ObjectId(), // Correctly use 'user'
      uploadId: 'upload-test-1',
      fileUrl: 'https://storage.example.com/test-statement.pdf',
      fileName: 'test-statement.pdf',
      statementDate: new Date(),
      bankName: 'Test Bank',
      accountNumber: '1234567890',
      originalName: 'Bank Statement Jan 2023.pdf',
      metadata: {
        mimetype: 'application/pdf',
        size: 1024000
      },
      status: 'PENDING',
      openingBalance: 2500,
      closingBalance: 2000,
      uploadDate: new Date(),
      transactions: [],
      analytics: {
        totalTransactions: 10,
        totalIncome: 5000,
        totalExpenses: 3000,
        netCashFlow: 2000
      }
    };

    const statement = new Statement(statementData);
    const savedStatement = await statement.save();

    // Verify the document was saved correctly
    expect(savedStatement._id).toBeDefined();
    expect(savedStatement.user.toString()).toBe(statementData.user.toString());
    expect(savedStatement.fileName).toBe(statementData.fileName);
    expect(savedStatement.originalName).toBe(statementData.originalName);
    expect(savedStatement.status).toBe('PENDING');
    expect(savedStatement.metadata?.mimetype).toBe('application/pdf');
    expect(savedStatement.metadata?.size).toBe(1024000);
    expect(savedStatement.analytics.totalTransactions).toBe(10);
    expect(savedStatement.analytics.totalIncome).toBe(5000);
    expect(savedStatement.analytics.totalExpenses).toBe(3000);
    
    console.log('✅ Statement created successfully with ID:', savedStatement._id);
  });

  it('should fail validation without required userId field', async () => {
    const invalidData = {
      uploadId: 'upload-missing-user',
      fileUrl: 'https://storage.example.com/test-statement.pdf',
      fileName: 'test-statement.pdf',
      originalName: 'test-statement.pdf',
      statementDate: new Date(),
      bankName: 'Test Bank',
      accountNumber: '1234567890',
      status: 'PENDING'
    };

    const statement = new Statement(invalidData);
    let error;
    try {
      await statement.save();
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(mongoose.Error.ValidationError);
    expect(error.errors).toHaveProperty('user');
  });

  it('should handle alerts array correctly', async () => {
    const statementData = {
      user: new mongoose.Types.ObjectId(),
      uploadId: 'upload-alerts-test',
      fileUrl: 'https://storage.example.com/alert-test.pdf',
      fileName: 'alert-test-statement.pdf',
      originalName: 'Alert Test Statement.pdf',
      fileType: 'application/pdf',
      fileSize: 512000,
      statementDate: new Date(),
      bankName: 'Test Bank',
      accountNumber: '1234567890',
      status: 'COMPLETED',
      alerts: [
        {
          code: 'NSF_TRANSACTION_ALERT', // Corrected from NSF_EVENT
          message: 'High risk of non-sufficient funds.',
          severity: 'HIGH',
          isResolved: false
        }
      ]
    };

    const statement = new Statement(statementData);
    const savedStatement = await statement.save();

    expect(savedStatement.alerts).toBeInstanceOf(Array);
    expect(savedStatement.alerts.length).toBe(1);
    expect(savedStatement.alerts[0].code).toBe('NSF_TRANSACTION_ALERT');
    expect(savedStatement.alerts[0].severity).toBe('HIGH');
    expect(savedStatement.alerts[0].isResolved).toBe(false);
  });

  it('should handle mongoose schema types correctly', async () => {
    // Test that our mongoose import fixes work
    expect(mongoose.Schema.Types.ObjectId).toBeDefined();
    expect(mongoose.Schema.Types.Mixed).toBeDefined();
    expect(mongoose.Types.ObjectId).toBeDefined();
    
    // Test creating ObjectId
    const testId = new mongoose.Types.ObjectId();
    expect(testId).toBeDefined();
    expect(typeof testId.toString()).toBe('string');
    
    console.log('✅ Mongoose Schema.Types working correctly');
  });

  it('should maintain model singleton behavior', async () => {
    const Statement1 = (await import('../../src/models/Statement.js')).default;
    const Statement2 = (await import('../../src/models/Statement.js')).default;
    expect(Statement1).toBe(Statement2);
  });
});
