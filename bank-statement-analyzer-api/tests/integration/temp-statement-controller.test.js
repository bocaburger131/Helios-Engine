import mongoose from 'mongoose';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { vi } from 'vitest';
import Statement from '../../src/models/Statement.js';
import Transaction from '../../src/models/Transaction.js';
// No longer importing User model here to simplify
import statementController from '../../src/controllers/statementController.js';
import riskAnalysisService from '../../src/services/riskAnalysisService.js';
import { PDFParserService } from '../../src/services/pdfParserService.js';



const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const waitForCompletion = async (statementId, timeout = 90000) => {
  const startTime = Date.now();
  console.log(`[${new Date().toISOString()}] Starting to wait for statement ${statementId}`);
  while (Date.now() - startTime < timeout) {
    const statement = await Statement.findById(statementId);
    console.log(`[${new Date().toISOString()}] Polling... current status: ${statement.status}`, statement.logs); // Added logging
    if (statement.status === 'COMPLETED' || statement.status === 'FAILED') {
      if (statement.status === 'FAILED') {
        console.error('Statement processing failed with error:', statement.error?.message);
      }
      return statement;
    }
    await new Promise(resolve => setTimeout(resolve, 2000)); // Poll every 2 seconds
  }
  const finalStatement = await Statement.findById(statementId);
  throw new Error(`Statement processing timed out after ${timeout / 1000}s. Final status: ${finalStatement.status}`);
};

describe('Statement Processing Integration Test', () => {
  let tempFilePath;
  let tempDir;
  let testUserId; // Use a simple variable for the ID
  let riskSpy;
  let pdfSpy;

  beforeAll(async () => {
    pdfSpy = vi.spyOn(PDFParserService.prototype, 'parsePDF').mockResolvedValue({
      transactions: [
        { date: '2024-01-05', description: 'Deposit', amount: 500, type: 'credit' },
        { date: '2024-01-10', description: 'Withdrawal', amount: -200, type: 'debit' }
      ],
      bankName: 'Test Bank',
      accountNumber: '****1234'
    });

    riskSpy = vi.spyOn(riskAnalysisService, 'analyzeFinancialRisk').mockResolvedValue({
      veritasScore: { score: 720, overall: 720, rating: 'LOW', factors: {} },
      summary: {
        riskCategory: 'LOW',
        transactionCount: 2,
        averageDailyBalance: 1500,
        totalDeposits: 500,
        totalWithdrawals: 200
      },
      riskFactors: [],
      riskIndicators: {},
      liquidityAnalysis: { averageDailyBalance: 1500 },
      depositsAndWithdrawals: { totalDeposits: 500, totalWithdrawals: 200 },
      metadata: { openingBalance: 0 }
    });
    // Just create a new ObjectId for the test user
    testUserId = new mongoose.Types.ObjectId();

    // Create a temporary directory for the test file
    const uploadId = 'manual';
    tempDir = path.join(process.cwd(), 'uploads', uploadId);
    await fs.mkdir(tempDir, { recursive: true });
    tempFilePath = path.join(tempDir, 'sample-statement.pdf');
  }, 20000);

  afterAll(async () => {
    pdfSpy?.mockRestore();
    riskSpy?.mockRestore();
    // Clean up the temporary file and directory
    try {
      if (tempDir) {
        await fs.rm(tempDir, { recursive: true, force: true });
      }
    } catch (error) {
      console.error('Failed to clean up temp directory:', error);
    }
  });

  beforeEach(async () => {
    // The global setup now handles clearing the database
  });

  it('should process a statement, parse transactions, and categorize them', async () => {
    const fixturePath = path.resolve(
      __dirname,
      '../../tests/fixtures/sample-statement.pdf'
    );
    // Copy the fixture to the temporary path before the test
    await fs.copyFile(fixturePath, tempFilePath);

    const statementData = {
      user: testUserId, // Use the generated ObjectId
      uploadId: 'manual',
      originalName: 'sample-statement.pdf',
      fileName: 'sample-statement.pdf',
      fileUrl: `/uploads/manual/sample-statement.pdf`,
      filePath: tempFilePath, // Use the correct temp path
      statementDate: new Date('2024-02-29'),
      status: 'PENDING',
      bankName: 'Test Bank', // Added required bankName
    };

    console.log('Creating statement with data:', statementData); // DEBUG LOG
    const statement = await Statement.create(statementData);
    console.log('Created statement object:', statement.toObject()); // DEBUG LOG

    // Manually trigger the async processing - simplified call
    statementController.processStatementAsync(statement._id);

    const processedStatement = await waitForCompletion(statement._id, 90000);

    // This part will only run if the status is 'COMPLETED'
    expect(processedStatement.status).toBe('COMPLETED');
    expect(processedStatement.transactionCount).toBeGreaterThan(0);
    expect(processedStatement.riskScore).toBeDefined();

    const transactions = await Transaction.find({ statementId: processedStatement._id });
    expect(transactions.length).toBe(processedStatement.transactionCount);
  }, 120000); // 120s timeout for the whole test
});
