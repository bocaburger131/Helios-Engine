import mongoose from 'mongoose';
import path from 'path';
import fs from 'fs/promises';
import Statement from '../models/Statement.js';
import Transaction from '../models/Transaction.js';
import { AppError } from '../utils/errors.js';
import { PDFParserService } from '../services/pdfParserService.js';
import riskAnalysisService from '../services/riskAnalysisService.js';
import NotificationService from '../services/NotificationService.js';
import logger from '../utils/logger.js';
import { normalizeTransactionsWithBalanceInference } from '../utils/transactionNormalization.js';

class StatementController {
  constructor() {
    this.pdfParser = new PDFParserService();
    this.riskAnalyzer = riskAnalysisService;
    
    // Bind methods to ensure 'this' context is preserved
    this.uploadStatement = this.uploadStatement.bind(this);
    this.getStatements = this.getStatements.bind(this);
    this.getStatementById = this.getStatementById.bind(this);
    this.analyzeStatement = this.analyzeStatement.bind(this);
    this.deleteStatement = this.deleteStatement.bind(this);
  }

  async uploadStatement(req, res, next) {
    try {
      const userId = req.user.id;
      const { statementDate, accountNumber, bankName, uploadId } = req.body;
      
      logger.info('Upload request received', { userId, body: req.body, file: req.file });
      
      if (!req.file) {
        throw new AppError('No file uploaded', 400);
      }

      // Generate uploadId if not provided
      const finalUploadId = uploadId || `upload_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      // Create upload directory
      const uploadDir = path.join(process.cwd(), 'uploads', finalUploadId);
      await fs.mkdir(uploadDir, { recursive: true });

      // Save file
      const fileName = `statement_${Date.now()}.pdf`;
      const filePath = path.join(uploadDir, fileName);
      await fs.writeFile(filePath, req.file.buffer);

      // Create statement document
      const ownerObjectId = new mongoose.Types.ObjectId(userId);
      const newStatement = await Statement.create({
        user: ownerObjectId,
        uploadId: finalUploadId,
        statementDate: new Date(statementDate || Date.now()),
        originalName: req.file.originalname,
        fileName: req.file.originalname,
        filePath,
        fileUrl: `/uploads/${finalUploadId}/${fileName}`,
        bankName: bankName || 'Unknown Bank',
        accountNumber: accountNumber || 'Unknown',
        openingBalance: 0,
        closingBalance: 0,
        status: 'PROCESSING',
        metadata: {
          originalName: req.file.originalname,
          size: req.file.size,
          mimetype: req.file.mimetype
        }
      });

      logger.info('Statement created successfully', { statementId: newStatement._id });

      // Notify user of upload
      await NotificationService.notifyStatementUploaded(userId, newStatement._id, req.file.originalname);

      // Trigger async processing
      this.processStatementAsync(newStatement._id, filePath, userId).catch(error => {
        logger.error('Async processing failed', error);
      });

      res.status(201).json({ 
        success: true, 
        data: { 
          statement: newStatement,
          message: 'Statement uploaded successfully. Processing will begin shortly.'
        } 
      });

    } catch (error) {
      logger.error('Error uploading statement:', error);
      next(error);
    }
  }

  async processStatementAsync(statementId, filePath, userId) {
    const stmtObjectId = statementId;
    try {
      const statement = await Statement.findById(stmtObjectId);
      if (!statement) {
        logger.error('processStatementAsync: statement not found', { statementId: stmtObjectId });
        return;
      }

      const resolvedPath = filePath || statement.filePath;
      if (!resolvedPath) {
        await Statement.findByIdAndUpdate(stmtObjectId, {
          status: 'FAILED',
          error: {
            message: 'No PDF file path available for processing',
            timestamp: new Date()
          }
        });
        return;
      }

      logger.info('Starting async statement processing', { statementId: stmtObjectId });

      await Statement.findByIdAndUpdate(stmtObjectId, {
        status: 'PROCESSING',
        processingStartedAt: new Date()
      });

      const parseResult = await this.pdfParser.parsePDF(resolvedPath);
      const rawTx = Array.isArray(parseResult?.transactions) ? parseResult.transactions : [];
      const ownerId = statement.user?._id || statement.user;

      const normalizedRows = normalizeTransactionsWithBalanceInference(rawTx);

      const transactionDocs = [];
      for (const norm of normalizedRows) {
        if (norm == null || !Number.isFinite(Number(norm.amount))) {
          continue;
        }
        const d = norm.date ? (norm.date instanceof Date ? norm.date : new Date(norm.date)) : null;
        if (!d || Number.isNaN(d.getTime())) {
          continue;
        }
        const ty = norm.type === 'DEBIT' || Number(norm.amount) < 0 ? 'DEBIT' : 'CREDIT';
        transactionDocs.push({
          statementId: statement._id,
          userId: ownerId,
          date: d,
          description: String(norm.description || 'Transaction').slice(0, 500),
          amount: norm.amount,
          type: ty,
          category: 'OTHER'
        });
      }

      if (transactionDocs.length > 0) {
        await Transaction.insertMany(transactionDocs);
      }

      const analysisInput = transactionDocs.map((t) => ({
        date: t.date,
        description: t.description,
        amount: t.amount,
        type: t.amount >= 0 ? 'credit' : 'debit'
      }));

      const analysis = await this.riskAnalyzer.analyzeFinancialRisk(analysisInput, {
        openingBalance: statement.openingBalance ?? 0,
        closingBalance: statement.closingBalance,
        bankName: statement.bankName
      });

      const score = analysis.veritasScore?.score ?? analysis.summary?.averageDailyBalance ?? 0;

      await Statement.findByIdAndUpdate(stmtObjectId, {
        status: 'COMPLETED',
        processingCompletedAt: new Date(),
        transactionCount: transactionDocs.length,
        riskScore: score,
        veritasScore: score,
        analysis
      });

      logger.info('Statement processing completed', { statementId: stmtObjectId });

      await NotificationService?.notifyProcessingComplete?.(userId, stmtObjectId, 'completed');

      if (analysis.summary?.riskCategory === 'HIGH' || analysis.summary?.riskCategory === 'VERY_HIGH') {
        await NotificationService?.notifyError?.(userId, stmtObjectId, analysis);
      }
    } catch (error) {
      logger.error('Error processing statement:', error);

      await Statement.findByIdAndUpdate(stmtObjectId, {
        status: 'FAILED',
        error: {
          message: error.message,
          stack: error.stack,
          timestamp: new Date()
        }
      });

      await NotificationService?.notifyProcessingComplete?.(userId, stmtObjectId, 'failed');
    }
  }

  async getStatements(req, res, next) {
    try {
      const userId = req.user.id;
      const { page = 1, limit = 10 } = req.query;
      
      const options = {
        page: parseInt(page),
        limit: parseInt(limit),
        sort: { createdAt: -1 }
      };
      
      const result = await Statement.paginate({ userId: new mongoose.Types.ObjectId(userId) }, options);
      
      res.status(200).json({ 
        success: true, 
        data: { 
          statements: result.docs
        },
        pagination: {
          total: result.totalDocs,
          page: result.page,
          pages: result.totalPages,
          limit: result.limit
        }
      });
    } catch (error) {
      logger.error('Error getting statements:', error);
      next(error);
    }
  }

  async getStatementById(req, res, next) {
    try {
      const { id } = req.params;
      const userId = req.user.id;

      const statement = await Statement.findOne({
        _id: id,
        userId: new mongoose.Types.ObjectId(userId)
      });

      if (!statement) {
        return res.status(404).json({ error: 'Statement not found' });
      }

      res.status(200).json({ success: true, data: { statement } });
    } catch (error) {
      logger.error('Error getting statement:', error);
      next(error);
    }
  }

  async analyzeStatement(req, res, next) {
    try {
      const { id } = req.params;
      const userId = req.user.id;

      // Find the statement
      const statement = await Statement.findOne({
        _id: id,
        userId: new mongoose.Types.ObjectId(userId)
      });

      if (!statement) {
        return res.status(404).json({ error: 'Statement not found' });
      }

      // Get transactions for this statement
      const transactions = await Transaction.find({ statementId: statement._id });

      // Perform risk analysis
      const analysis = this.riskAnalyzer.analyze(transactions, statement);

      // Update statement with analysis
      await Statement.findByIdAndUpdate(statement._id, {
        analysis: analysis,
        lastAnalyzedAt: new Date()
      });

      res.status(200).json({ 
        success: true, 
        data: { 
          analysis,
          statement: {
            id: statement._id,
            fileName: statement.fileName,
            bankName: statement.bankName,
            statementDate: statement.statementDate
          }
        } 
      });
    } catch (error) {
      logger.error('Error analyzing statement:', error);
      next(error);
    }
  }

  async deleteStatement(req, res, next) {
    try {
      const { id } = req.params;
      const userId = req.user.id;

      const statement = await Statement.findOneAndDelete({
        _id: id,
        userId: new mongoose.Types.ObjectId(userId)
      });

      if (!statement) {
        return res.status(404).json({ error: 'Statement not found' });
      }

      // Delete associated transactions
      await Transaction.deleteMany({ statementId: statement._id });

      // Try to delete the file (don't fail if file doesn't exist)
      if (statement.fileUrl) {
        try {
          const filePath = path.join(process.cwd(), statement.fileUrl);
          await fs.unlink(filePath);
        } catch (error) {
          logger.warn('Failed to delete file', { error: error.message, fileUrl: statement.fileUrl });
        }
      }

      res.status(200).json({ 
        success: true, 
        message: 'Statement deleted successfully' 
      });
    } catch (error) {
      logger.error('Error deleting statement:', error);
      next(error);
    }
  }
}

export default StatementController;
