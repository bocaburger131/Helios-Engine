// Test utilities and mocks
import { vi } from 'vitest';

// Mock logger
export const mockLogger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn()
};

// Mock Redis service
export const mockRedisService = {
  cacheAnalysis: vi.fn().mockResolvedValue(true),
  getCachedAnalysis: vi.fn().mockResolvedValue(null),
  deleteCachedAnalysis: vi.fn().mockResolvedValue(true),
  cacheStatement: vi.fn().mockResolvedValue(true),
  getCachedStatement: vi.fn().mockResolvedValue(null),
  cacheRiskAnalysis: vi.fn().mockResolvedValue(true),
  getCachedRiskAnalysis: vi.fn().mockResolvedValue(null),
  cachePerplexityAnalysis: vi.fn().mockResolvedValue(true),
  getCachedPerplexityAnalysis: vi.fn().mockResolvedValue(null),
  clearStatementCache: vi.fn().mockResolvedValue(3),
  getCacheStats: vi.fn().mockResolvedValue({
    type: 'memory',
    size: 0,
    connected: false
  }),
  healthCheck: vi.fn().mockResolvedValue({
    status: 'mocked',
    connected: true
  })
};

// Mock PDF parser service
export const mockPdfParserService = {
  parsePDF: vi.fn().mockResolvedValue({
    transactions: [
      { date: '2024-01-01', description: 'Test Transaction', amount: 1000, type: 'credit' }
    ],
    metadata: {
      accountHolder: 'Test User',
      accountNumber: '****1234',
      bankName: 'Test Bank',
      statementPeriod: {
        start: '2024-01-01',
        end: '2024-01-31'
      }
    }
  }),
  parseStatement: vi.fn().mockResolvedValue({
    transactions: [
      { date: '2024-01-01', description: 'Test Transaction', amount: 1000, type: 'credit' },
      { date: '2024-01-02', description: 'Test Withdrawal', amount: -500, type: 'debit' }
    ]
  }),
  _extractAccountInfo: vi.fn().mockResolvedValue({
    bankName: 'Test Bank',
    accountNumbers: ['****1234'],
    confidence: 0.95,
    customerName: 'Test User',
    statementPeriod: {
      start: '2024-01-01',
      end: '2024-01-31'
    }
  }),
  parseTextStatement: vi.fn().mockResolvedValue({
    transactions: [
      { date: '2024-01-01', description: 'Test Transaction', amount: 1000, type: 'credit' }
    ]
  })
};

// Mock risk analysis service with proper method returns 
export const mockRiskAnalysisService = {
  analyzeStatementRisk: vi.fn().mockResolvedValue({
    overallRiskScore: 25,
    riskLevel: 'LOW',
    velocityAnalysis: {
      riskScore: 10,
      patterns: []
    },
    spendingPatterns: {
      riskScore: 15,
      anomalies: []
    },
    seasonalityAnalysis: {
      riskScore: 5,
      trends: []
    },
    creditBehavior: {
      riskScore: 20,
      nsfCount: 0
    },
    industryRisk: {
      riskScore: 10,
      factors: []
    }
  }),
  analyzeRisk: vi.fn().mockImplementation((transactions, openingBalance = 0) => {
    if (!Array.isArray(transactions)) {
      throw new Error('Transactions must be an array');
    }

    // Calculate components using inline helper functions
    function calcNSFCount(trans) {
      const nsfKeywords = [
        'nsf', 'insufficient funds', 'overdraft', 'returned check',
        'returned item', 'bounce', 'non-sufficient', 'overdraw'
      ];
      let count = 0;
      trans.forEach(transaction => {
        if (transaction && transaction.description) {
          const description = String(transaction.description).toLowerCase();
          const isNSF = nsfKeywords.some(keyword => description.includes(keyword));
          if (isNSF) count++;
        }
      });
      return count;
    }

    function calcTotals(trans) {
      let totalDeposits = 0;
      let totalWithdrawals = 0;
      trans.forEach(transaction => {
        if (transaction && typeof transaction.amount === 'number') {
          if (transaction.amount > 0) {
            totalDeposits += transaction.amount;
          } else {
            totalWithdrawals += Math.abs(transaction.amount);
          }
        }
      });
      return {
        totalDeposits: Math.round(totalDeposits * 100) / 100,
        totalWithdrawals: Math.round(totalWithdrawals * 100) / 100
      };
    }

    function calcAvgBalance(trans, opening) {
      if (trans.length === 0) {
        return { averageDailyBalance: opening, periodDays: 0 };
      }
      
      const sortedTransactions = [...trans].sort((a, b) => new Date(a.date) - new Date(b.date));
      const dailyTransactions = {};
      
      sortedTransactions.forEach(transaction => {
        const date = transaction.date;
        if (!dailyTransactions[date]) {
          dailyTransactions[date] = [];
        }
        dailyTransactions[date].push(transaction);
      });

      const dates = Object.keys(dailyTransactions).sort();
      const startDate = new Date(dates[0]);
      const endDate = new Date(dates[dates.length - 1]);
      
      let currentBalance = opening;
      let totalBalanceSum = 0;
      let dayCount = 0;

      const currentDate = new Date(startDate);
      while (currentDate <= endDate) {
        const dateStr = currentDate.toISOString().split('T')[0];
        
        if (dailyTransactions[dateStr]) {
          dailyTransactions[dateStr].forEach(transaction => {
            if (transaction && typeof transaction.amount === 'number') {
              currentBalance += transaction.amount;
            }
          });
        }
        
        totalBalanceSum += currentBalance;
        dayCount++;
        
        currentDate.setDate(currentDate.getDate() + 1);
      }

      const averageDailyBalance = dayCount > 0 ? Math.round((totalBalanceSum / dayCount) * 100) / 100 : opening;
      return { averageDailyBalance, periodDays: dayCount };
    }

    const nsfCount = calcNSFCount(transactions);
    const totals = calcTotals(transactions);
    const balanceAnalysis = calcAvgBalance(transactions, openingBalance);
    
    const withdrawalRatio = totals.totalDeposits > 0 ? 
      totals.totalWithdrawals / totals.totalDeposits : 1;

    let riskScore = 0;
    riskScore += nsfCount * 30;

    if (balanceAnalysis.averageDailyBalance < 1000) {
      riskScore += 20;
    }

    if (withdrawalRatio > 0.8) {
      riskScore += 25;
    }

    if (balanceAnalysis.averageDailyBalance < 0) {
      riskScore += 40;
    }

    riskScore = Math.min(riskScore, 100);

    let riskLevel;
    if (riskScore >= 80) {
      riskLevel = 'HIGH';
    } else if (riskScore >= 40) {
      riskLevel = 'MEDIUM';
    } else if (riskScore >= 20) {
      riskLevel = 'LOW';
    } else {
      riskLevel = 'VERY_LOW';
    }

    return {
      riskScore,
      riskLevel,
      nsfCount,
      averageDailyBalance: balanceAnalysis.averageDailyBalance,
      withdrawalRatio: Math.round(withdrawalRatio * 100) / 100,
      totalDeposits: totals.totalDeposits,
      totalWithdrawals: totals.totalWithdrawals
    };
  }),
  calculateTotalDepositsAndWithdrawals: vi.fn().mockImplementation((transactions) => {
    if (!Array.isArray(transactions)) {
      throw new Error('Transactions must be an array');
    }
    
    let totalDeposits = 0;
    let totalWithdrawals = 0;

    transactions.forEach(transaction => {
      if (transaction && typeof transaction.amount === 'number') {
        if (transaction.amount > 0) {
          totalDeposits += transaction.amount;
        } else {
          totalWithdrawals += Math.abs(transaction.amount);
        }
      }
    });

    return {
      totalDeposits: Math.round(totalDeposits * 100) / 100,
      totalWithdrawals: Math.round(totalWithdrawals * 100) / 100
    };
  }),
  calculateNSFCount: vi.fn().mockImplementation((transactions) => {
    if (!Array.isArray(transactions)) {
      throw new Error('Transactions must be an array');
    }

    const nsfKeywords = [
      'nsf', 'insufficient funds', 'overdraft', 'returned check',
      'returned item', 'bounce', 'non-sufficient', 'overdraw',
      'insufficient', 'returned deposit', 'reject', 'decline',
      'unavailable funds', 'return fee', 'chargeback', 'reversal',
      'dishonored', 'unpaid', 'refer to maker', 'od fee', 'overdraft charge',
      'return item'
    ];

    let nsfCount = 0;
    transactions.forEach(transaction => {
      if (transaction && transaction.description) {
        const description = String(transaction.description).toLowerCase();
        const isNSF = nsfKeywords.some(keyword => description.includes(keyword));
        if (isNSF) {
          nsfCount++;
        }
      }
    });

    return nsfCount;
  }),
  calculateAverageDailyBalance: vi.fn().mockImplementation(function(transactions, openingBalance) {
    // Handle the default parameter manually to catch undefined/null
    if (arguments.length === 1) {
      openingBalance = 0;
    } else if (openingBalance === undefined || openingBalance === null || typeof openingBalance !== 'number' || isNaN(openingBalance)) {
      throw new Error('Opening balance must be a number');
    }

    if (!Array.isArray(transactions)) {
      throw new Error('Transactions must be an array');
    }

    if (transactions.length === 0) {
      return {
        averageDailyBalance: openingBalance,
        periodDays: 0
      };
    }

    const sortedTransactions = [...transactions].sort((a, b) => new Date(a.date) - new Date(b.date));

    const dailyTransactions = {};
    sortedTransactions.forEach(transaction => {
      const date = transaction.date;
      if (!dailyTransactions[date]) {
        dailyTransactions[date] = [];
      }
      dailyTransactions[date].push(transaction);
    });

    const dates = Object.keys(dailyTransactions).sort();
    const startDate = new Date(dates[0]);
    const endDate = new Date(dates[dates.length - 1]);
    
    let currentBalance = openingBalance;
    let totalBalanceSum = 0;
    let dayCount = 0;

    const currentDate = new Date(startDate);
    while (currentDate <= endDate) {
      const dateStr = currentDate.toISOString().split('T')[0];
      
      if (dailyTransactions[dateStr]) {
        dailyTransactions[dateStr].forEach(transaction => {
          if (transaction && typeof transaction.amount === 'number') {
            currentBalance += transaction.amount;
          }
        });
      }
      
      totalBalanceSum += currentBalance;
      dayCount++;
      
      currentDate.setDate(currentDate.getDate() + 1);
    }

    const averageDailyBalance = dayCount > 0 ? Math.round((totalBalanceSum / dayCount) * 100) / 100 : openingBalance;

    return {
      averageDailyBalance,
      periodDays: dayCount
    };
  }),
  calculateVeritasScore: vi.fn().mockReturnValue({
    score: 750,
    grade: 'A'
  })
};

// Mock Perplexity service
export const mockPerplexityService = {
  analyzeStatementData: vi.fn().mockResolvedValue({
    riskFactors: [
      {
        type: 'spending_pattern',
        severity: 'MEDIUM',
        description: 'Irregular spending patterns detected'
      }
    ],
    insights: [
      {
        category: 'financial_health',
        description: 'Overall financial position appears stable'
      }
    ],
    recommendations: [
      {
        type: 'budgeting',
        description: 'Consider setting up automatic savings'
      }
    ],
    summary: {
      totalTransactions: 50,
      averageAmount: 250
    }
  })
};

// Mock Mongoose models
export const mockStatement = {
  create: vi.fn().mockResolvedValue({
    _id: 'test-statement-id',
    userId: 'test-user-id',
    fileName: 'test.pdf',
    status: 'processed'
  }),
  findById: vi.fn().mockResolvedValue({
    _id: 'test-statement-id',
    userId: 'test-user-id',
    fileName: 'test.pdf',
    status: 'processed'
  }),
  find: vi.fn().mockResolvedValue([]),
  findOne: vi.fn().mockResolvedValue(null),
  save: vi.fn().mockResolvedValue({
    _id: 'test-statement-id'
  })
};

export const mockUser = {
  findById: vi.fn().mockResolvedValue({
    _id: 'test-user-id',
    email: 'test@example.com',
    name: 'Test User'
  }),
  findOne: vi.fn().mockResolvedValue(null),
  create: vi.fn().mockResolvedValue({
    _id: 'test-user-id',
    email: 'test@example.com'
  })
};

// Mock environment variables
export const mockEnv = {
  NODE_ENV: 'test',
  JWT_SECRET: 'test-jwt-secret',
  MONGODB_URI: 'mongodb://localhost:27017/test',
  REDIS_URL: 'redis://localhost:6379',
  PERPLEXITY_API_KEY: 'test-perplexity-key',
  ZOHO_CLIENT_ID: 'test-zoho-id',
  ZOHO_CLIENT_SECRET: 'test-zoho-secret',
  ZOHO_REFRESH_TOKEN: 'test-zoho-refresh'
};

// Mock multer middleware with all necessary methods
export const mockMulter = {
  single: vi.fn(() => (req, res, next) => {
    req.file = {
      filename: 'test.pdf',
      originalname: 'test.pdf',
      mimetype: 'application/pdf',
      size: 1024,
      path: '/tmp/test.pdf',
      buffer: Buffer.from('test file content')
    };
    next();
  }),
  array: vi.fn(() => (req, res, next) => {
    req.files = [
      {
        filename: 'test1.pdf',
        originalname: 'test1.pdf',
        mimetype: 'application/pdf',
        size: 1024,
        path: '/tmp/test1.pdf',
        buffer: Buffer.from('test file content')
      }
    ];
    next();
  }),
  fields: vi.fn(() => (req, res, next) => {
    req.files = {
      statements: [
        {
          filename: 'test1.pdf',
          originalname: 'test1.pdf',
          mimetype: 'application/pdf',
          size: 1024,
          path: '/tmp/test1.pdf',
          buffer: Buffer.from('test file content')
        }
      ]
    };
    next();
  }),
  // Static methods that multer provides
  memoryStorage: vi.fn(() => ({
    _handleFile: vi.fn((req, file, cb) => {
      file.buffer = Buffer.from('test file content');
      cb(null, {
        buffer: file.buffer,
        size: file.buffer.length
      });
    }),
    _removeFile: vi.fn((req, file, cb) => cb())
  })),
  diskStorage: vi.fn((options = {}) => ({
    _handleFile: vi.fn((req, file, cb) => {
      const filename = options.filename ? options.filename(req, file, cb) : 'test.pdf';
      const destination = options.destination ? options.destination(req, file, cb) : '/tmp';
      cb(null, {
        filename,
        destination,
        path: `${destination}/${filename}`,
        size: 1024
      });
    }),
    _removeFile: vi.fn((req, file, cb) => cb())
  }))
};

// Mock authentication middleware
export const mockAuthMiddleware = (req, res, next) => {
  req.user = {
    id: '507f1f77bcf86cd799439011',     // ← Consistent ID  
    _id: '507f1f77bcf86cd799439011',    // ← Added missing _id
    email: 'test@example.com',
    name: 'Test User',
    role: 'user'                        // ← Added role
  };
  next();
};

// Mock validation middleware
export const mockValidationMiddleware = (req, res, next) => {
  next();
};

// Utility function to mock all services
export const mockAllServices = () => {
  vi.mock('../../src/utils/logger.js', () => ({ default: mockLogger }));
  vi.mock('../../src/services/RedisService.js', () => ({ default: mockRedisService }));
  vi.mock('../../src/services/pdfParserService.js', () => {
    class MockPDFParserService {
      constructor() {
        Object.assign(this, mockPdfParserService);
      }
    }

    return {
      __esModule: true,
      PDFParserService: MockPDFParserService,
      default: new MockPDFParserService()
    };
  });
  vi.mock('../../src/services/riskAnalysisService.js', () => ({ default: mockRiskAnalysisService }));
  vi.mock('../../src/services/perplexityService.js', () => ({ default: mockPerplexityService }));
  vi.mock('../../src/models/Statement.js', () => ({ default: mockStatement }));
  vi.mock('../../src/models/User.js', () => ({ default: mockUser }));
  
  // Note: mongoose and multer are mocked in separate setup files to avoid hoisting issues
  
  vi.mock('../../src/middleware/auth.middleware.js', () => ({
    authenticateToken: mockAuthMiddleware,
    authenticateUser: mockAuthMiddleware,
    optionalAuth: mockAuthMiddleware
  }));
};

// Test data generators
export const generateMockTransactions = (count = 10) => {
  const transactions = [];
  for (let i = 0; i < count; i++) {
    transactions.push({
      date: `2024-01-${String(i + 1).padStart(2, '0')}`,
      description: `Transaction ${i + 1}`,
      amount: Math.random() > 0.5 ? Math.random() * 1000 : -Math.random() * 500,
      type: Math.random() > 0.5 ? 'credit' : 'debit',
      balance: 1000 + (Math.random() - 0.5) * 2000
    });
  }
  return transactions;
};

export const generateMockStatement = (overrides = {}) => {
  return {
    _id: 'test-statement-id',
    userId: 'test-user-id',
    fileName: 'test-statement.pdf',
    uploadDate: new Date(),
    processedDate: new Date(),
    status: 'processed',
    transactions: generateMockTransactions(20),
    transactionCount: 20,
    analysis: {
      riskScore: 25,
      riskLevel: 'LOW',
      veritasScore: 750
    },
    ...overrides
  };
};

// Setup and teardown helpers
export const setupTestEnvironment = (options = {}) => {
  // Set environment variables
  Object.keys(mockEnv).forEach(key => {
    process.env[key] = mockEnv[key];
  });
  
  // Only mock services for integration tests or when explicitly requested
  // Unit tests should test actual implementations unless disabled
  const shouldMockServices = options.mockServices !== false && 
    (options.testType === 'integration' || 
     process.env.VITEST_POOL_ID?.includes('integration') ||
     globalThis.__VITEST_INTEGRATION_TEST__ === true);
  
  if (shouldMockServices) {
    mockAllServices();
  }
};

// Setup for integration tests only
export const setupIntegrationTestEnvironment = () => {
  setupTestEnvironment({ testType: 'integration', mockServices: true });
};

// Setup for unit tests only (no service mocking)
export const setupUnitTestEnvironment = () => {
  setupTestEnvironment({ testType: 'unit', mockServices: false });
};

export const teardownTestEnvironment = () => {
  vi.clearAllMocks();
  vi.resetAllMocks();
};
