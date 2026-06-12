// filepath: src/routes/AuthRoute.test.js
import { describe, it, expect, beforeEach, afterEach, vi, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import app from '../app.js';
import User from '../models/User.js';
import { connectToInMemoryDB, closeDatabase, clearDatabase } from '../../tests/utils/testDb.js';

// Authentication test variables
const testUserPassword = 'TestPass123!@#';
const duplicateTestEmail = 'duplicate@example.com';
const validTestEmail = 'test@example.com';
const invalidTestEmail = 'invalid-email';

// Mock the User model
vi.mock('../models/User.js', () => ({
  default: {
    findOne: vi.fn(),
    create: vi.fn(),
    findById: vi.fn(),
    deleteMany: vi.fn().mockResolvedValue({ deletedCount: 0 })
  }
}));

// Mock bcrypt for password hashing
vi.mock('bcryptjs', () => ({
  default: {
    hash: vi.fn().mockResolvedValue('$2a$12$hashedpassword'),
    compare: vi.fn().mockResolvedValue(true)
  }
}));

// Mock jsonwebtoken
vi.mock('jsonwebtoken', () => ({
  default: {
    sign: vi.fn().mockReturnValue('mock.jwt.token'),
    verify: vi.fn().mockReturnValue({ userId: 'user123' })
  }
}));

describe('Authentication Routes', () => {
  let testUser;

  beforeEach(async () => {
    vi.clearAllMocks();
    
    // Set up test user data
    testUser = {
      _id: '507f1f77bcf86cd799439011',
      name: 'Test User',
      email: validTestEmail,
      password: await require('bcryptjs').hash(testUserPassword, 12),
      isEmailVerified: true
    };
  });

  describe('POST /api/auth/register', () => {
    it('should register a new user successfully', async () => {
      User.findOne.mockResolvedValue(null); // No existing user
      User.create.mockResolvedValue({
        _id: testUser._id,
        name: testUser.name,
        email: testUser.email,
        isEmailVerified: false
      });

      const response = await request(app)
        .post('/api/auth/register')
        .send({
          name: 'Test User',
          email: validTestEmail,
          password: testUserPassword
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.message).toContain('registered successfully');
    });

    it('should reject duplicate email registration', async () => {
      User.findOne.mockResolvedValue(testUser); // Existing user

      const response = await request(app)
        .post('/api/auth/register')
        .send({
          name: 'Duplicate User',
          email: duplicateTestEmail,
          password: testUserPassword
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('already exists');
    });

    it('should reject invalid email format', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send({
          name: 'Test User',
          email: invalidTestEmail,
          password: testUserPassword
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });
  });

  describe('POST /api/auth/login', () => {
    it('should login with valid credentials', async () => {
      User.findOne.mockReturnValue({
        select: vi.fn().mockResolvedValue(testUser)
      });

      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: validTestEmail,
          password: testUserPassword
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('token');
      expect(response.body.data).toHaveProperty('user');
    });

    it('should reject invalid password', async () => {
      User.findOne.mockReturnValue({
        select: vi.fn().mockResolvedValue(testUser)
      });
      
      // Mock bcrypt.compare to return false for wrong password
      const bcrypt = require('bcryptjs');
      bcrypt.compare.mockResolvedValue(false);

      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: validTestEmail,
          password: 'WrongPassword'
        });

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Invalid credentials');
    });

    it('should reject non-existent user', async () => {
      User.findOne.mockReturnValue({
        select: vi.fn().mockResolvedValue(null)
      });

      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'nonexistent@example.com',
          password: testUserPassword
        });

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Invalid credentials');
    });
  });

  describe('GET /api/auth/me', () => {
    it('should return user profile with valid token', async () => {
      User.findById.mockResolvedValue({
        _id: testUser._id,
        name: testUser.name,
        email: testUser.email,
        isEmailVerified: testUser.isEmailVerified
      });

      const response = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer mock.jwt.token`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.user.email).toBe(validTestEmail);
    });

    it('should reject request without token', async () => {
      const response = await request(app)
        .get('/api/auth/me');

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
    });
  });
});
        _id: testUser._id,
        name: testUser.name,
        email: testUser.email,
        isEmailVerified: testUser.isEmailVerified
      });

      const response = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer mock.jwt.token`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.user.email).toBe(validTestEmail);
    });

    it('should reject request without token', async () => {
      const response = await request(app)
        .get('/api/auth/me');

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
    });
  });
});

// Import and re-export existing Statement Controller tests if needed

// Mock the dependencies
vi.mock('../models/statementModel.js', () => {
  const mockStatementInstance = {
    save: vi.fn().mockResolvedValue(true),
    _id: 'stmt123'
  };
  
  const StatementMock = vi.fn().mockImplementation((data) => ({
    ...mockStatementInstance,
    ...data
  }));
  
  // Add static methods
  StatementMock.findById = vi.fn();
  StatementMock.findOne = vi.fn(); 
  StatementMock.find = vi.fn();
  StatementMock.mockImplementation = vi.fn();
  
  return { default: StatementMock };
});

vi.mock('../services/analysisService.js', () => ({
  analyzeTransactions: vi.fn().mockResolvedValue({
    riskScore: 0.3,
    alerts: []
  })
}));

vi.mock('../services/secureFileProcessor.js', () => ({
  processSecureFile: vi.fn().mockResolvedValue({
    transactions: [],
    metadata: {}
  })
}));

vi.mock('../services/exportService.js', () => ({
  exportToPDF: vi.fn().mockResolvedValue(Buffer.from('PDF content')),
  exportToExcel: vi.fn().mockResolvedValue(Buffer.from('Excel content'))
}));

// Mock pdfParserService
vi.mock('../services/pdfParserService.js', () => {
  const PDFParserService = vi.fn().mockImplementation(() => ({
    extractTransactions: vi.fn().mockResolvedValue([
      { id: 1, description: 'Test Transaction', amount: -100, date: '2024-01-01', type: 'debit' },
      { id: 2, description: 'Income', amount: 2000, date: '2024-01-02', type: 'credit' }
    ])
  }));
  return { default: PDFParserService };
});

// Mock riskAnalysisService
vi.mock('../services/riskAnalysisService.js', () => ({
  default: {
    analyzeRisk: vi.fn().mockReturnValue({
      riskLevel: 'LOW',
      riskScore: 0.2
    }),
    calculateTotalDepositsAndWithdrawals: vi.fn().mockReturnValue({
      totalDeposits: 2000,
      totalWithdrawals: 100
    }),
    calculateNSFCount: vi.fn().mockReturnValue({
      nsfCount: 0,
      nsfTransactions: []
    }),
    calculateAverageDailyBalance: vi.fn().mockReturnValue({
      averageBalance: 1500,
      periodDays: 30,
      startDate: '2024-01-01',
      endDate: '2024-01-31'
    }),
    calculateVeritasScore: vi.fn().mockReturnValue({
      score: 750,
      grade: 'A'
    })
  }
}));

// Mock incomeStabilityService
vi.mock('../services/incomeStabilityService.js', () => ({
  default: class MockIncomeStabilityService {
    constructor() {
      this.incomeKeywords = ['payroll', 'salary', 'deposit'];
      this.minIncomeAmount = 50;
      this.maxIncomeInterval = 45;
    }
    
    analyze() {
      return {
        stabilityScore: 85,
        stabilityLevel: 'HIGH',
        stabilityRatio: 0.85,
        incomePattern: {
          totalIncomeTransactions: 3,
          totalIncomeAmount: 6000,
          averageIncomeAmount: 2000
        },
        intervalAnalysis: {
          intervals: [14, 14],
          statistics: {
            mean: 14,
            standardDeviation: 0,
            median: 14,
            variance: 0,
            count: 2
          },
          interpretation: {
            level: 'VERY_STABLE',
            description: 'Highly regular income pattern'
          }
        },
        recommendations: ['Income stability analysis shows positive results']
      };
    }
    
    filterIncomeTransactions(transactions) {
      return transactions.filter(t => t.amount > 0 && t.description?.toLowerCase().includes('payroll'));
    }
    
    calculateIntervals(transactions) {
      return [14, 14];
    }
    
    calculateStatistics(intervals) {
      return {
        mean: 14,
        standardDeviation: 0,
        median: 14,
        variance: 0,
        min: 14,
        max: 14,
        count: 2
      };
    }
    
    calculateStabilityScore(stats, intervals) {
      return 85;
    }
    
    interpretStabilityScore(score) {
      return {
        level: 'VERY_STABLE',
        description: 'Highly regular income pattern',
        recommendation: 'Excellent income stability'
      };
    }
    
    generateRecommendations(score, stats) {
      return ['Income stability analysis shows positive results'];
    }
    
    isValidDate(dateString) {
      return !isNaN(Date.parse(dateString));
    }
  }
}));

// Mock AlertsEngineService
vi.mock('../services/AlertsEngineService.js', () => ({
  default: class MockAlertsEngineService {
    generateAlerts() {
      return [];
    }
  }
}));

// Mock searchService
vi.mock('../services/searchService.js', () => ({
  searchTransactions: vi.fn().mockResolvedValue({
    transactions: [],
    totalCount: 0,
    page: 1,
    totalPages: 0
  })
}));

// Mock budgetService
vi.mock('../services/budgetService.js', () => ({
  setBudget: vi.fn().mockResolvedValue({ success: true }),
  getBudget: vi.fn().mockResolvedValue({ budget: 1000 }),
  analyzeBudget: vi.fn().mockResolvedValue({ analysis: 'good' })
}));

// Mock ZohoCrmService
vi.mock('../services/crm/zoho.service.js', () => ({
  default: class MockZohoCrmService {
    createLead() {
      return Promise.resolve({ id: 'lead123' });
    }
  }
}));

describe('Statement Controller', () => {
  let mockReq, mockRes, mockNext;

  beforeEach(() => {
    vi.clearAllMocks();
    
    mockReq = {
      params: {},
      query: {},
      body: {},
      file: null,
      user: { id: 'user123' }
    };
    
    mockRes = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
      send: vi.fn().mockReturnThis(),
      setHeader: vi.fn().mockReturnThis()
    };
    
    // Mock next function
    mockNext = vi.fn();
    
    // Set up default Statement mocks
    const mockStatement = {
      _id: 'stmt123',
      userId: 'user123',
      filename: 'statement.pdf',
      status: 'processed',
      transactions: [
        { id: 1, description: 'Grocery Store', amount: -50, date: '2024-01-01' },
        { id: 2, description: 'Grocery Outlet', amount: -30, date: '2024-01-02' },
        { id: 3, description: 'Salary', amount: 2000, date: '2024-01-03' }
      ],
      toObject: vi.fn().mockReturnValue({
        _id: 'stmt123',
        filename: 'statement.pdf'
      })
    };
    
    Statement.findById.mockResolvedValue(mockStatement);
    Statement.findOne.mockResolvedValue(mockStatement);
  });

  describe('uploadStatement', () => {
    it('should upload statement successfully', async () => {
      mockReq.file = {
        filename: 'test.pdf',
        originalname: 'bank-statement.pdf',
        mimetype: 'application/pdf',
        size: 1024000,
        path: '/tmp/test.pdf'
      };

      const mockStatement = {
        _id: 'stmt123',
        filename: 'test.pdf',
        status: 'pending',
        save: vi.fn().mockResolvedValue(true)
      };

      Statement.mockImplementation(() => mockStatement);
      processSecureFile.mockResolvedValue({
        transactions: [],
        metadata: {}
      });

      await StatementController.uploadStatement(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(201);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        data: expect.objectContaining({
          id: 'stmt123',
          message: 'Statement uploaded successfully'
        })
      });
    });

    it('should fail without file', async () => {
      await StatementController.uploadStatement(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: 'No PDF file uploaded'
      });
    });

    it('should fail with invalid file type', async () => {
      mockReq.file = {
        filename: 'test.exe',
        originalname: 'malicious.exe',
        mimetype: 'application/x-msdownload',
        size: 1024000
      };

      await StatementController.uploadStatement(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: expect.stringContaining('Invalid file type')
      });
    });

    it('should fail with oversized file', async () => {
      mockReq.file = {
        filename: 'test.pdf',
        originalname: 'huge-statement.pdf',
        mimetype: 'application/pdf',
        size: 50 * 1024 * 1024 // 50MB
      };

      await StatementController.uploadStatement(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: expect.stringContaining('File size exceeds')
      });
    });
  });

  describe('getStatementById', () => {
    it('should retrieve statement successfully', async () => {
      mockReq.params.id = 'stmt123';
      
      const mockStatement = {
        _id: 'stmt123',
        userId: 'user123',
        filename: 'statement.pdf',
        status: 'processed',
        toObject: vi.fn().mockReturnValue({
          _id: 'stmt123',
          filename: 'statement.pdf'
        })
      };

      Statement.findById = vi.fn().mockResolvedValue(mockStatement);

      await StatementController.getStatementById(mockReq, mockRes, mockNext);

      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        data: expect.objectContaining({
          _id: 'stmt123',
          filename: 'statement.pdf'
        })
      });
    });

    it('should fail with invalid ID format', async () => {
      mockReq.params.id = 'invalid-id';

      await StatementController.getStatementById(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: 'Invalid statement ID'
      });
    });

    it('should fail when statement not found', async () => {
      mockReq.params.id = '507f1f77bcf86cd799439011';
      Statement.findById = vi.fn().mockResolvedValue(null);

      await StatementController.getStatementById(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(404);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: 'Statement not found'
      });
    });

    it('should prevent access to other users statements', async () => {
      mockReq.params.id = 'stmt123';
      mockReq.user.id = 'user456'; // Different user
      
      const mockStatement = {
        _id: 'stmt123',
        userId: 'user123' // Original owner
      };

      Statement.findById = vi.fn().mockResolvedValue(mockStatement);

      await StatementController.getStatementById(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(403);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: 'Access denied'
      });
    });
  });

  describe('searchTransactions', () => {
    it('should search transactions with query', async () => {
      mockReq.params.id = 'stmt123';
      mockReq.query.q = 'grocery';
      mockReq.query.page = '1';
      mockReq.query.limit = '10';

      const mockStatement = {
        _id: 'stmt123',
        userId: 'user123',
        transactions: [
          { id: 1, description: 'Grocery Store', amount: -50, date: '2024-01-01' },
          { id: 2, description: 'Grocery Outlet', amount: -30, date: '2024-01-02' },
          { id: 3, description: 'Salary', amount: 2000, date: '2024-01-03' }
        ]
      };

      Statement.findById = vi.fn().mockResolvedValue(mockStatement);

      await StatementController.searchTransactions(mockReq, mockRes, mockNext);

      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        data: {
          transactions: expect.any(Array),
          totalCount: expect.any(Number),
          page: 1,
          totalPages: expect.any(Number)
        }
      });
    });

    it('should filter by date range', async () => {
      mockReq.params.id = 'stmt123';
      mockReq.query.startDate = '2024-01-01';
      mockReq.query.endDate = '2024-01-02';

      const mockStatement = {
        _id: 'stmt123',
        userId: 'user123',
        transactions: [
          { id: 1, description: 'Grocery Store', amount: -50, date: '2024-01-01' },
          { id: 2, description: 'Grocery Outlet', amount: -30, date: '2024-01-02' },
          { id: 3, description: 'Salary', amount: 2000, date: '2024-01-03' }
        ]
      };

      Statement.findById = vi.fn().mockResolvedValue(mockStatement);

      await StatementController.searchTransactions(mockReq, mockRes, mockNext);

      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        data: {
          transactions: expect.any(Array),
          totalCount: expect.any(Number),
          page: 1,
          totalPages: expect.any(Number)
        }
      });
    });

    it('should handle SQL injection attempts in search', async () => {
      mockReq.params.id = 'stmt123';
      mockReq.query.q = "'; DROP TABLE statements; --";
      
      const mockStatement = {
        _id: 'stmt123',
        userId: 'user123',
        transactions: []
      };

      Statement.findById = vi.fn().mockResolvedValue(mockStatement);

      await StatementController.searchTransactions(mockReq, mockRes, mockNext);

      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        data: {
          transactions: expect.any(Array),
          totalCount: expect.any(Number),
          page: 1,
          totalPages: expect.any(Number)
        }
      });
    });
  });

  describe('exportStatement', () => {
    it('should export statement as PDF', async () => {
      mockReq.params.id = 'stmt123';
      mockReq.query.format = 'pdf';

      const mockStatement = {
        _id: 'stmt123',
        userId: 'user123',
        transactions: []
      };

      Statement.findById = vi.fn().mockResolvedValue(mockStatement);

      await StatementController.exportStatement(mockReq, mockRes, mockNext);

      expect(mockRes.setHeader).toHaveBeenCalledWith('Content-Type', 'application/pdf');
      expect(mockRes.send).toHaveBeenCalled();
    });

    it('should export statement as Excel', async () => {
      mockReq.params.id = 'stmt123';
      mockReq.query.format = 'excel';

      const mockStatement = {
        _id: 'stmt123',
        userId: 'user123',
        transactions: []
      };

      Statement.findById = vi.fn().mockResolvedValue(mockStatement);

      await StatementController.exportStatement(mockReq, mockRes, mockNext);

      expect(mockRes.setHeader).toHaveBeenCalledWith('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      expect(mockRes.send).toHaveBeenCalled();
    });

    it('should fail with invalid export format', async () => {
      mockReq.params.id = 'stmt123';
      mockReq.query.format = 'invalid';

      await StatementController.exportStatement(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: 'Invalid export format'
      });
    });
  });

  describe('Error Handling', () => {
    it('should handle database errors gracefully', async () => {
      mockReq.params.id = 'stmt123';
      Statement.findById = vi.fn().mockRejectedValue(new Error('Database connection failed'));

      await StatementController.getStatementById(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: 'Internal server error'
      });
    });

    it('should handle file processing errors', async () => {
      mockReq.file = {
        filename: 'corrupted.pdf',
        originalname: 'corrupted-statement.pdf',
        mimetype: 'application/pdf',
        size: 1024000
      };

      processSecureFile.mockRejectedValue(new Error('File processing failed'));

      await StatementController.uploadStatement(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(422);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: 'File processing failed'
      });
    });
  });
});
