import pdfParse from 'pdf-parse';
import csv from 'csv-parser';
import fs from 'fs';
import { Readable } from 'stream';
import storageService from './storageService.js';
import Transaction from '../models/Transaction.js';
import Statement from '../models/Statement.js';
import logger from '../utils/logger.js';

class StatementProcessor {
  constructor() {
    this.bankParsers = new Map();
    this.setupParsers();
  }

  setupParsers() {
    // Add bank-specific parsers
    this.bankParsers.set('chase', this.parseChaseStatement);
    this.bankParsers.set('bofa', this.parseBofAStatement);
    this.bankParsers.set('wells-fargo', this.parseWellsFargoStatement);
    // Add more as needed
  }

  async processStatement(statementId) {
    try {
      const statement = await Statement.findById(statementId);
      if (!statement) {
        throw new Error('Statement not found');
      }

      logger.info(`Processing statement: ${statementId}`);
      statement.status = 'processing';
      await statement.save();

      // Download file from GCS
      const fileBuffer = await this.downloadFile(statement.filePath);
      
      // Process based on file type
      let transactions = [];
      if (statement.mimeType === 'application/pdf') {
        transactions = await this.processPDF(fileBuffer, statement);
      } else if (statement.mimeType === 'text/csv') {
        transactions = await this.processCSV(fileBuffer, statement);
      } else {
        throw new Error('Unsupported file type');
      }

      // Save transactions
      const savedTransactions = await Transaction.insertMany(
        transactions.map(t => ({
          ...t,
          statementId: statement._id,
          userId: statement.userId
        }))
      );

      // Update statement
      statement.status = 'completed';
      statement.transactionCount = savedTransactions.length;
      statement.processedAt = new Date();
      
      // Calculate summary
      const summary = this.calculateSummary(savedTransactions);
      statement.summary = summary;
      
      await statement.save();

      logger.info(`Statement processed successfully: ${statementId}, ${savedTransactions.length} transactions`);
      
      return { statement, transactions: savedTransactions };
      
    } catch (error) {
      logger.error(`Error processing statement ${statementId}:`, error);
      
      // Update statement status
      await Statement.findByIdAndUpdate(statementId, {
        status: 'failed',
        error: error.message
      });
      
      throw error;
    }
  }

  async processPDF(buffer, statement) {
    const data = await pdfParse(buffer);
    const text = data.text;
    
    // Detect bank type
    const bankType = this.detectBank(text);
    logger.info(`Detected bank type: ${bankType}`);
    
    // Use appropriate parser
    const parser = this.bankParsers.get(bankType) || this.genericPDFParser;
    return parser.call(this, text, statement);
  }

  async processCSV(buffer, statement) {
    const transactions = [];
    const stream = Readable.from(buffer.toString());
    
    return new Promise((resolve, reject) => {
      stream
        .pipe(csv())
        .on('data', (row) => {
          const transaction = this.parseCSVRow(row, statement);
          if (transaction) {
            transactions.push(transaction);
          }
        })
        .on('end', () => resolve(transactions))
        .on('error', reject);
    });
  }

  parseCSVRow(row, statement) {
    // Generic CSV parser - customize based on bank format
    try {
      return {
        date: new Date(row.Date || row.date || row.DATE),
        description: row.Description || row.description || row.DESC,
        amount: parseFloat(row.Amount || row.amount || row.AMOUNT),
        category: row.Category || row.category || 'Uncategorized',
        type: parseFloat(row.Amount || row.amount || 0) > 0 ? 'credit' : 'debit',
        balance: parseFloat(row.Balance || row.balance || 0),
        reference: row.Reference || row.reference || row.REF || null,
        metadata: {
          raw: row
        }
      };
    } catch (error) {
      logger.error('Error parsing CSV row:', error);
      return null;
    }
  }

  detectBank(text) {
    const patterns = {
      'chase': /chase|jpmorgan/i,
      'bofa': /bank of america|bofa/i,
      'wells-fargo': /wells fargo/i,
      'citibank': /citibank|citi/i,
      // Add more patterns
    };

    for (const [bank, pattern] of Object.entries(patterns)) {
      if (pattern.test(text)) {
        return bank;
      }
    }

    return 'generic';
  }

  genericPDFParser(text, statement) {
    // Basic transaction extraction from PDF text
    const transactions = [];
    const lines = text.split('\n');
    
    // Look for transaction patterns (customize based on your needs)
    const transactionPattern = /(\d{1,2}\/\d{1,2}\/\d{2,4})\s+(.+?)\s+\$?([\d,]+\.?\d*)/;
    
    for (const line of lines) {
      const match = line.match(transactionPattern);
      if (match) {
        transactions.push({
          date: new Date(match[1]),
          description: match[2].trim(),
          amount: parseFloat(match[3].replace(',', '')),
          type: 'debit', // You'd need logic to determine credit vs debit
          category: 'Uncategorized'
        });
      }
    }
    
    return transactions;
  }

  calculateSummary(transactions) {
    const credits = transactions.filter(t => t.type === 'credit');
    const debits = transactions.filter(t => t.type === 'debit');
    
    return {
      totalCredits: credits.reduce((sum, t) => sum + t.amount, 0),
      totalDebits: debits.reduce((sum, t) => sum + t.amount, 0),
      transactionCount: transactions.length,
      creditCount: credits.length,
      debitCount: debits.length,
      startDate: transactions.length > 0 ? 
        transactions.reduce((min, t) => t.date < min ? t.date : min, transactions[0].date) : null,
      endDate: transactions.length > 0 ?
        transactions.reduce((max, t) => t.date > max ? t.date : max, transactions[0].date) : null
    };
  }

  async downloadFile(filePath) {
    // For now, assuming GCS integration
    // In production, this would download from GCS
    const [file] = await storageService.bucket.file(filePath).download();
    return file;
  }
}

export default new StatementProcessor();