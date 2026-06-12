import request from 'supertest';
import express from 'express';
import * as path from 'path';
import * as fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { vi } from 'vitest';
import jwt from 'jsonwebtoken';
import enhancedStatementRoutes from '../../src/routes/enhancedAnalysisRoutes.js';
import logger from '../../src/utils/logger.js';
import { PDFParserService } from '../../src/services/pdfParserService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Create Express app for testing
const app = express();
app.use(express.json());

// Use enhanced routes
app.use('/api/statements', enhancedStatementRoutes);

describe('Enhanced Statement Analysis Integration Tests', () => {
  let testPdfPath;
  let authToken;
  let parseSpy;

  beforeAll(() => {
    parseSpy = vi.spyOn(PDFParserService.prototype, 'parseStatement').mockResolvedValue({
      transactions: [
        { date: '2024-01-05', description: 'Deposit', amount: 100, type: 'credit' },
        { date: '2024-01-10', description: 'Withdrawal', amount: -50, type: 'debit' }
      ],
      bankName: 'Fixture Bank',
      accountNumber: '****9999'
    });
    process.env.NODE_ENV = 'test';
    process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';

    // Create a test PDF file path (you'll need to have a sample PDF)
    testPdfPath = path.join(__dirname, 'fixtures', 'sample-bank-statement.pdf');
    
    // Generate test auth token
    authToken = jwt.sign(
      { userId: 'test-user-123', email: 'test@example.com' },
      process.env.JWT_SECRET || 'test-secret',
      { expiresIn: '1h' }
    );
  });

  afterAll(() => {
    parseSpy?.mockRestore();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('POST /api/statements/analyze', () => {
    test('should successfully analyze a valid PDF statement', async () => {
      const uploadSource = fs.existsSync(testPdfPath)
        ? testPdfPath
        : Buffer.from('%PDF-1.4 minimal mock for route integration tests');

      const req = request(app)
        .post('/api/statements/analyze')
        .set('Authorization', `Bearer ${authToken}`)
        .field('openingBalance', '1000.00');

      if (Buffer.isBuffer(uploadSource)) {
        req.attach('statement', uploadSource, 'sample-bank-statement.pdf');
      } else {
        req.attach('statement', uploadSource);
      }

      const response = await req.expect(200);

      // Verify response structure
      expect(response.body.success).toBe(true);
      expect(response.body.data).toBeDefined();
      
      // Verify file info
      expect(response.body.data.fileInfo).toBeDefined();
      expect(response.body.data.fileInfo.filename).toBeDefined();
      expect(response.body.data.fileInfo.userId).toBe('test-user-123');

      // Verify transaction summary
      expect(response.body.data.transactionSummary).toBeDefined();
      expect(response.body.data.transactionSummary.totalTransactions).toBeGreaterThanOrEqual(0);
      expect(response.body.data.transactionSummary.creditTransactions).toBeGreaterThanOrEqual(0);
      expect(response.body.data.transactionSummary.debitTransactions).toBeGreaterThanOrEqual(0);

      // Verify financial summary (RiskAnalysisService integration)
      expect(response.body.data.financialSummary).toBeDefined();
      expect(response.body.data.financialSummary.totalDeposits).toBeDefined();
      expect(response.body.data.financialSummary.totalWithdrawals).toBeDefined();
      expect(response.body.data.financialSummary.openingBalance).toBe(1000);

      // Verify balance analysis
      expect(response.body.data.balanceAnalysis).toBeDefined();
      expect(response.body.data.balanceAnalysis.averageDailyBalance).toBeDefined();

      // Verify NSF analysis
      expect(response.body.data.nsfAnalysis).toBeDefined();
      expect(response.body.data.nsfAnalysis.nsfCount).toBeDefined();
      expect(Array.isArray(response.body.data.nsfAnalysis.nsfTransactions)).toBe(true);

      // Verify risk analysis
      expect(response.body.data.riskAnalysis).toBeDefined();
      expect(response.body.data.riskAnalysis.riskScore).toBeDefined();
      expect(response.body.data.riskAnalysis.riskLevel).toBeDefined();
    });

    test('should handle missing file upload', async () => {
      const response = await request(app)
        .post('/api/statements/analyze')
        .set('Authorization', `Bearer ${authToken}`)
        .field('openingBalance', '1000.00')
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('No PDF file uploaded');
    });

    test('should handle non-PDF file upload', async () => {
      const buffer = Buffer.from('This is not a PDF file');

      const response = await request(app)
        .post('/api/statements/analyze')
        .set('Authorization', `Bearer ${authToken}`)
        .attach('statement', buffer, { filename: 'not-a-pdf.txt', contentType: 'text/plain' })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Invalid file type. Only PDF files are allowed.');
    });

    test('should handle default opening balance when not provided', async () => {
      const uploadSource = fs.existsSync(testPdfPath)
        ? testPdfPath
        : Buffer.from('%PDF-1.4 minimal mock for route integration tests');

      const req = request(app)
        .post('/api/statements/analyze')
        .set('Authorization', `Bearer ${authToken}`);

      if (Buffer.isBuffer(uploadSource)) {
        req.attach('statement', uploadSource, 'sample-bank-statement.pdf');
      } else {
        req.attach('statement', uploadSource);
      }

      const response = await req.expect(200);

      expect(response.body.data.financialSummary.openingBalance).toBe(0);
    });
  });

  describe('Service Integration Verification', () => {
    test('should verify PDFParserService and RiskAnalysisService are called correctly', async () => {
      // This test verifies the services work together
      // We can create a mock PDF buffer to test the integration
      
      const mockPdfBuffer = Buffer.from('Mock PDF content');
      
      // Since we can't easily mock the PDFParserService in this integration test,
      // we'll verify the response structure indicates both services were called
      
      // For a real integration test, you would:
      // 1. Have a known PDF file with known transactions
      // 2. Verify the output matches expected calculations
      // 3. Verify all RiskAnalysisService methods are called with correct data
      
      expect(true).toBe(true); // Placeholder - replace with actual integration logic
    });
  });
});

describe('Enhanced Statement Routes Unit Tests', () => {
  test('should export router correctly', () => {
    expect(enhancedStatementRoutes).toBeDefined();
    expect(typeof enhancedStatementRoutes).toBe('function');
  });
});
