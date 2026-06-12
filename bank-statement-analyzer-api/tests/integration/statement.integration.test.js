import { describe, it, expect, beforeEach, beforeAll, afterEach, afterAll, vi } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import path from 'path';
import fs from 'fs';
import app from '../../src/app.js';
import mongoose from 'mongoose';

const User = mongoose.model('User');
const Transaction = mongoose.model('Transaction');
const Statement = mongoose.model('Statement');

const originalUserMethods = {
  deleteMany: User.deleteMany,
  create: User.create,
  findOne: User.findOne,
  findById: User.findById
};

const originalStatementMethods = {
  save: Statement.prototype.save,
  insertMany: Statement.insertMany,
  find: Statement.find,
  countDocuments: Statement.countDocuments,
  findById: Statement.findById,
  create: Statement.create,
  deleteOne: Statement.deleteOne
};

const originalTransactionMethods = {
  deleteMany: Transaction.deleteMany,
  insertMany: Transaction.insertMany,
  find: Transaction.find
};

console.log('🧪 Statement Integration Tests: Using global test setup');
console.log('🔧 Models loaded from global setup:', { 
  userAvailable: !!User, 
  statementAvailable: !!Statement 
});

describe('Statement Integration Tests', () => {
  let authToken;
  let testUser;
  const testUserEmail = 'statementtest@example.com';
  const testUserPassword = 'TestPass123!@#';

  beforeAll(async () => {
    // No need to connect to MongoDB - using mocks
  });

  beforeEach(async () => {
    // Clear all mocks
    vi.clearAllMocks();
    
    // Mock test user
    testUser = {
      _id: '6765d4b8a1b2c3d4e5f6a7b8',
      email: testUserEmail,
      password: '$2b$12$hashedPasswordForTesting', // Pre-hashed password mock
      name: 'Test User',
      isEmailVerified: true,
      save: vi.fn()
    };

    // Reset User model mocks
    User.deleteMany = vi.fn().mockResolvedValue({ deletedCount: 0 });
    User.create = vi.fn().mockImplementation((userData = {}) => {
      if (!userData || userData.email === testUserEmail) {
        return Promise.resolve({ ...testUser });
      }

      const generatedUser = {
        _id: userData._id || new mongoose.Types.ObjectId().toString(),
        email: userData.email,
        password: userData.password || '$2b$12$hashedPasswordForTesting',
        name: userData.name || 'Generated Test User',
        isEmailVerified: userData.isEmailVerified ?? true,
        save: vi.fn()
      };

      return Promise.resolve(generatedUser);
    });
    User.findOne = vi.fn().mockImplementation(({ email }) => {
      if (email === testUserEmail) {
        return Promise.resolve({
          ...testUser,
          select: vi.fn().mockReturnValue(testUser)
        });
      }
      return Promise.resolve(null);
    });
    
    // Mock User.findById for auth middleware
    User.findById = vi.fn().mockImplementation((id) => {
      if (id === testUser._id) {
        return {
          select: vi.fn().mockResolvedValue(testUser)
        };
      }
      return {
        select: vi.fn().mockResolvedValue(null)
      };
    });

    // Mock Statement model methods will use mongoose mock
    
    const mockStatements = [];
    
    Statement.prototype.save = vi.fn().mockImplementation(function() {
      const generatedId = this._id ? this._id.toString() : new mongoose.Types.ObjectId().toString();
      this._id = generatedId;
      mockStatements.push(this);
      return Promise.resolve(this);
    });

    Statement.insertMany = vi.fn().mockImplementation((statements) => {
      mockStatements.push(...statements);
      return Promise.resolve(statements);
    });
    
    const makeChain = (results) => {
      let _skip = 0;
      let _limit = results.length;
      const getSlice = () => results.slice(_skip, _skip + (_limit > 0 ? _limit : results.length));
      const chain = {
        sort: vi.fn().mockReturnThis(),
        skip: vi.fn((n) => { _skip = n || 0; return chain; }),
        limit: vi.fn((n) => { if (n && n > 0) _limit = n; return chain; }),
        select: vi.fn().mockReturnThis(),
        lean: vi.fn(() => Promise.resolve(getSlice())),
        exec: vi.fn(() => Promise.resolve(getSlice())),
        // make the chain thenable so `await Statement.find(...)...sort()` works
        then: (resolve, reject) => Promise.resolve(getSlice()).then(resolve, reject),
        catch: (reject) => Promise.resolve(getSlice()).catch(reject)
      };
      return chain;
    };

    Statement.find = vi.fn().mockImplementation((query = {}) => {
      let results = mockStatements;
      // Filter by user (support both 'user' and 'userId' fields)
      if (query.user) {
        const userId = query.user?.toString();
        results = results.filter(s => (s.user || s.userId)?.toString() === userId);
      } else if (query.userId) {
        results = results.filter(s => s.userId === query.userId);
      }
      // Filter by bankName
      if (query.bankName) {
        results = results.filter(s => s.bankName === query.bankName);
      }
      // Filter by statementDate range
      if (query.statementDate) {
        if (query.statementDate.$gte) {
          results = results.filter(s => s.statementDate >= query.statementDate.$gte);
        }
        if (query.statementDate.$lte) {
          results = results.filter(s => s.statementDate <= query.statementDate.$lte);
        }
      }
      return makeChain(results);
    });
    
    Statement.countDocuments = vi.fn().mockImplementation((query = {}) => {
      let results = mockStatements;
      // Filter by user (support both 'user' and 'userId' fields)
      if (query.user) {
        const userId = query.user?.toString();
        results = results.filter(s => (s.user || s.userId)?.toString() === userId);
      } else if (query.userId) {
        results = results.filter(s => s.userId === query.userId);
      }
      // Filter by bankName
      if (query.bankName) {
        results = results.filter(s => s.bankName === query.bankName);
      }
      // Filter by statementDate range
      if (query.statementDate) {
        if (query.statementDate.$gte) {
          results = results.filter(s => s.statementDate >= query.statementDate.$gte);
        }
        if (query.statementDate.$lte) {
          results = results.filter(s => s.statementDate <= query.statementDate.$lte);
        }
      }
      return Promise.resolve(results.length);
    });
    
    Statement.findById = vi.fn().mockImplementation((id) => {
      const statement = mockStatements.find(s => s._id?.toString() === id?.toString());
      // Use a single-item thenable (not makeChain which expects arrays)
      const val = statement || null;
      return {
        select: vi.fn().mockReturnThis(),
        lean: vi.fn().mockResolvedValue(val),
        exec: vi.fn().mockResolvedValue(val),
        then: (resolve, reject) => Promise.resolve(val).then(resolve, reject),
        catch: (fn) => Promise.resolve(val).catch(fn)
      };
    });
    
    Statement.create = vi.fn().mockImplementation((data = {}) => {
      const generatedId = data._id ? data._id.toString() : new mongoose.Types.ObjectId().toString();

      const statement = {
        ...data,
        _id: generatedId,
        save: vi.fn().mockResolvedValue(true)
      };
      mockStatements.push(statement);
      return Promise.resolve(statement);
    });
    
    Statement.deleteOne = vi.fn().mockImplementation(({ _id }) => {
      const index = mockStatements.findIndex(s => s._id === _id);
      if (index > -1) {
        mockStatements.splice(index, 1);
        return Promise.resolve({ deletedCount: 1 });
      }
      return Promise.resolve({ deletedCount: 0 });
    });

    // Mock Transaction model methods
    const mockTransactions = [];
    
    Transaction.deleteMany = vi.fn().mockResolvedValue({ deletedCount: 0 });
    Transaction.insertMany = vi.fn().mockImplementation((transactions) => {
      mockTransactions.push(...transactions);
      return Promise.resolve(transactions);
    });
    Transaction.find = vi.fn().mockImplementation((query = {}) => {
      let results = mockTransactions;
      if (query.statementId) {
        const sid = query.statementId?.toString?.() ?? query.statementId;
        results = mockTransactions.filter(t => (t.statementId?.toString?.() ?? t.statementId) === sid);
      }
      const sorted = [...results].sort((a, b) => new Date(a.date) - new Date(b.date));
      return {
        sort: vi.fn().mockReturnThis(),
        lean: vi.fn().mockResolvedValue(sorted),
        exec: vi.fn().mockResolvedValue(sorted)
      };
    });

    // Create JWT token directly for testing - use same secret as auth middleware
    authToken = jwt.sign(
      { id: testUser._id }, 
      process.env.JWT_SECRET || 'your-secret-key',
      { expiresIn: '1h' }
    );
  });

  afterEach(async () => {
    // Clean up upload directories
    const uploadsDir = path.join(process.cwd(), 'uploads');
    if (fs.existsSync(uploadsDir)) {
      fs.rmSync(uploadsDir, { recursive: true, force: true });
    }
    
    vi.clearAllMocks();
  });

  afterAll(async () => {
    if (originalUserMethods.deleteMany) {
      User.deleteMany = originalUserMethods.deleteMany;
    } else {
      delete User.deleteMany;
    }

    if (originalUserMethods.create) {
      User.create = originalUserMethods.create;
    } else {
      delete User.create;
    }

    if (originalUserMethods.findOne) {
      User.findOne = originalUserMethods.findOne;
    } else {
      delete User.findOne;
    }

    if (originalUserMethods.findById) {
      User.findById = originalUserMethods.findById;
    } else {
      delete User.findById;
    }

    if (originalStatementMethods.save) {
      Statement.prototype.save = originalStatementMethods.save;
    } else {
      delete Statement.prototype.save;
    }

    if (originalStatementMethods.insertMany) {
      Statement.insertMany = originalStatementMethods.insertMany;
    } else {
      delete Statement.insertMany;
    }

    if (originalStatementMethods.find) {
      Statement.find = originalStatementMethods.find;
    } else {
      delete Statement.find;
    }

    if (originalStatementMethods.countDocuments) {
      Statement.countDocuments = originalStatementMethods.countDocuments;
    } else {
      delete Statement.countDocuments;
    }

    if (originalStatementMethods.findById) {
      Statement.findById = originalStatementMethods.findById;
    } else {
      delete Statement.findById;
    }

    if (originalStatementMethods.create) {
      Statement.create = originalStatementMethods.create;
    } else {
      delete Statement.create;
    }

    if (originalStatementMethods.deleteOne) {
      Statement.deleteOne = originalStatementMethods.deleteOne;
    } else {
      delete Statement.deleteOne;
    }

    if (originalTransactionMethods.deleteMany) {
      Transaction.deleteMany = originalTransactionMethods.deleteMany;
    } else {
      delete Transaction.deleteMany;
    }

    if (originalTransactionMethods.insertMany) {
      Transaction.insertMany = originalTransactionMethods.insertMany;
    } else {
      delete Transaction.insertMany;
    }

    if (originalTransactionMethods.find) {
      Transaction.find = originalTransactionMethods.find;
    } else {
      delete Transaction.find;
    }

    // No need to close database connection - using mocks
  });

  describe('POST /api/statements', () => {
    it('should upload a statement successfully', async () => {
      // Create a sample PDF buffer
      const pdfBuffer = Buffer.from('%PDF-1.4\n%Fake PDF content for testing');
      const uploadId = `test-upload-${Date.now()}`;

      const response = await request(app)
        .post('/api/statements')
        .set('Authorization', `Bearer ${authToken}`)
        .field('uploadId', uploadId)
        .field('statementDate', new Date().toISOString())
        .field('accountNumber', '1234567890')
        .field('bankName', 'Test Bank')
        .attach('statement', pdfBuffer, 'test-statement.pdf');

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('success', true);
      expect(response.body.data).toHaveProperty('statement');
      expect(response.body.data.statement).toHaveProperty('uploadId', uploadId);
      expect(response.body.data.statement).toHaveProperty('fileName', 'test-statement.pdf');
      expect(response.body.data.statement).toHaveProperty('status', 'processing');
      expect(response.body.data.statement).toHaveProperty('bankName', 'Test Bank');
      expect(response.body.data.statement).toHaveProperty('accountNumber', '1234567890');
    });

    it('should reject upload without authentication', async () => {
      const pdfBuffer = Buffer.from('%PDF-1.4\n%Fake PDF content');
      
      const response = await request(app)
        .post('/api/statements')
        .field('uploadId', 'test-upload-unauth')
        .attach('statement', pdfBuffer, 'test-statement.pdf');

      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('success', false);
      expect(response.body).toHaveProperty('error');
    });

    it('should reject upload without file', async () => {
      const response = await request(app)
        .post('/api/statements')
        .set('Authorization', `Bearer ${authToken}`)
        .field('uploadId', 'test-upload-no-file');

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('success', false);
      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('No PDF file uploaded');
    });

    it('should reject upload without uploadId', async () => {
      const pdfBuffer = Buffer.from('%PDF-1.4\n%Fake PDF content');
      
      const response = await request(app)
        .post('/api/statements')
        .set('Authorization', `Bearer ${authToken}`)
        .attach('statement', pdfBuffer, 'test-statement.pdf');

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('success', false);
      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('Upload ID is required');
    });

    it('should reject non-PDF files', async () => {
      const textBuffer = Buffer.from('This is not a PDF file');
      
      const response = await request(app)
        .post('/api/statements')
        .set('Authorization', `Bearer ${authToken}`)
        .field('uploadId', 'test-upload-wrong-type')
        .attach('statement', textBuffer, 'test-document.txt');

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('success', false);
    });
  });

  describe('GET /api/statements', () => {
    beforeEach(async () => {
      // Create some test statements — use 'user' to match the schema field
      // and to be consistent with the controller's query (which uses 'user').
      const statements = [
        {
          user: testUser._id,
          uploadId: 'test-upload-1',
          fileName: 'statement1.pdf',
          fileUrl: '/uploads/test-upload-1/statement1.pdf',
          filePath: '/fake/path/statement1.pdf',
          statementDate: new Date('2024-01-15'),
          bankName: 'Bank A',
          accountNumber: '1234',
          status: 'completed',
          openingBalance: 1000,
          closingBalance: 1500,
          transactionCount: 10
        },
        {
          user: testUser._id,
          uploadId: 'test-upload-2',
          fileName: 'statement2.pdf',
          fileUrl: '/uploads/test-upload-2/statement2.pdf',
          filePath: '/fake/path/statement2.pdf',
          statementDate: new Date('2024-02-15'),
          bankName: 'Bank B',
          accountNumber: '5678',
          status: 'completed',
          openingBalance: 1500,
          closingBalance: 2000,
          transactionCount: 15
        }
      ];

      await Statement.insertMany(statements);
    });

    it('should get all statements for authenticated user', async () => {
      const response = await request(app)
        .get('/api/statements')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body.data).toHaveProperty('statements');
      expect(response.body.data.statements).toHaveLength(2);
      expect(response.body.data).toHaveProperty('pagination');
      expect(response.body.data.pagination).toHaveProperty('total', 2);
    });

    it('should filter statements by date range', async () => {
      const response = await request(app)
        .get('/api/statements')
        .set('Authorization', `Bearer ${authToken}`)
        .query({
          startDate: '2024-02-01',
          endDate: '2024-02-28'
        })
        .expect(200);

      expect(response.body.data.statements).toHaveLength(1);
      expect(response.body.data.statements[0]).toHaveProperty('bankName', 'Bank B');
    });

    it('should filter statements by bank name', async () => {
      const response = await request(app)
        .get('/api/statements')
        .set('Authorization', `Bearer ${authToken}`)
        .query({ bankName: 'Bank A' })
        .expect(200);

      expect(response.body.data.statements).toHaveLength(1);
      expect(response.body.data.statements[0]).toHaveProperty('bankName', 'Bank A');
    });

    it('should paginate results', async () => {
      const response = await request(app)
        .get('/api/statements')
        .set('Authorization', `Bearer ${authToken}`)
        .query({ page: 1, limit: 1 })
        .expect(200);

      expect(response.body.data.statements).toHaveLength(1);
      expect(response.body.data.pagination).toHaveProperty('page', 1);
      expect(response.body.data.pagination).toHaveProperty('limit', 1);
      expect(response.body.data.pagination).toHaveProperty('pages', 2);
    });
  });

  describe('GET /api/statements/:id', () => {
    let testStatement;

    beforeEach(async () => {
      testStatement = await Statement.create({
        userId: testUser._id,
        uploadId: 'test-upload-detail',
        fileName: 'statement-detail.pdf',
        fileUrl: '/uploads/test-upload-detail/statement-detail.pdf',
        filePath: '/fake/path/statement-detail.pdf',
        statementDate: new Date(),
        bankName: 'Test Bank',
        accountNumber: '9999',
        status: 'completed',
        openingBalance: 5000,
        closingBalance: 6000,
        transactionCount: 5
      });

      // Create some transactions for this statement
      const transactions = [
        {
          statementId: testStatement._id,
          userId: testUser._id,
          date: new Date('2024-01-10'),
          description: 'Salary Credit',
          amount: 5000,
          type: 'credit',
          balance: 10000
        },
        {
          statementId: testStatement._id,
          userId: testUser._id,
          date: new Date('2024-01-15'),
          description: 'Rent Payment',
          amount: 2000,
          type: 'debit',
          balance: 8000
        }
      ];

      await Transaction.insertMany(transactions);
    });

    it('should get statement details with transactions', async () => {
      const response = await request(app)
        .get(`/api/statements/${testStatement._id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body.data).toHaveProperty('statement');
      expect(response.body.data).toHaveProperty('transactions');
      expect(response.body.data.statement._id).toBe(testStatement._id.toString());
      expect(response.body.data.transactions).toHaveLength(2);
    });

    it('should not get statement of another user', async () => {
      // Create another user
      const anotherUser = await User.create({
        name: 'Another User',
        email: 'another@example.com',
        password: '$2b$12$anotherHashedPasswordForTesting', // Pre-hashed password mock
        isEmailVerified: true
      });

      // Create statement for another user
      const anotherStatement = await Statement.create({
        userId: anotherUser._id,
        uploadId: 'another-upload',
        fileName: 'another.pdf',
        fileUrl: '/uploads/another-upload/another.pdf',
        filePath: '/fake/path/another.pdf',
        statementDate: new Date(),
        bankName: 'Another Bank',
        accountNumber: '0000',
        status: 'completed'
      });

      const response = await request(app)
        .get(`/api/statements/${anotherStatement._id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404);

      expect(response.body).toHaveProperty('success', false);
      expect(response.body).toHaveProperty('error');
    });

    it('should handle invalid statement ID', async () => {
      const response = await request(app)
        .get('/api/statements/invalid-id')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(400);

      expect(response.body).toHaveProperty('success', false);
      expect(response.body.error).toContain('Invalid statement ID');
    });
  });

  describe('DELETE /api/statements/:id', () => {
    let testStatement;

    beforeEach(async () => {
      testStatement = await Statement.create({
        _id: '6765d4b8a1b2c3d4e5f6a7b1', // Fixed ID for testing
        userId: testUser._id,
        uploadId: 'test-upload-delete',
        fileName: 'statement-delete.pdf',
        fileUrl: '/uploads/test-upload-delete/statement-delete.pdf',
        filePath: '/fake/path/statement-delete.pdf',
        statementDate: new Date(),
        bankName: 'Delete Bank',
        accountNumber: '1111',
        status: 'completed'
      });
    });

    it('should delete statement successfully', async () => {
      const response = await request(app)
        .delete(`/api/statements/${testStatement._id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('message', 'Statement deleted successfully');

      // Verify statement is deleted
      const deletedStatement = await Statement.findById(testStatement._id);
      expect(deletedStatement).toBeNull();
    });

    it('should not delete statement of another user', async () => {
      // Create another user and their statement
      const anotherUser = await User.create({
        name: 'Another User',
        email: 'delete-another@example.com',
        password: '$2b$12$deleteAnotherHashedPasswordForTesting', // Pre-hashed password mock
        isEmailVerified: true
      });

      const anotherStatement = await Statement.create({
        userId: anotherUser._id,
        uploadId: 'another-delete',
        fileName: 'another-delete.pdf',
        fileUrl: '/uploads/another-delete/another-delete.pdf',
        filePath: '/fake/path/another-delete.pdf',
        statementDate: new Date(),
        bankName: 'Another Bank',
        accountNumber: '2222',
        status: 'completed'
      });

      const response = await request(app)
        .delete(`/api/statements/${anotherStatement._id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404);

      expect(response.body).toHaveProperty('success', false);

      // Verify statement still exists
      const existingStatement = await Statement.findById(anotherStatement._id);
      expect(existingStatement).not.toBeNull();
    });
  });
});