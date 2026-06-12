import { promises as fs } from 'fs';
import path from 'path';
import logger from '../utils/logger.js';

/**
 * PDF Service for extracting bank statement data
 * Handles parsing of PDF bank statements and transaction extraction
 */
class PdfService {
  /**
   * Extract transactions from a bank statement PDF file
   * @param {string} filePath - Path to the PDF file
   * @returns {Promise<{transactions: Array, metadata: Object}>}
   */
  async extractTransactions(filePath) {
    try {
      logger.info(`Starting PDF extraction for: ${filePath}`);
      
      // Validate file exists
      if (!filePath || typeof filePath !== 'string') {
        throw new Error('Invalid file path provided');
      }

      // Check if file exists
      try {
        await fs.access(filePath);
      } catch (error) {
        throw new Error(`File not found: ${filePath}`);
      }

      // Get file info
      const fileStats = await fs.stat(filePath);
      const fileName = path.basename(filePath);
      
      logger.info(`Processing file: ${fileName}, size: ${fileStats.size} bytes`);

      // For now, return mock data structure that matches expected format
      // This should be replaced with actual PDF parsing logic
      const mockTransactions = this.generateMockTransactions();
      
      const result = {
        transactions: mockTransactions,
        metadata: {
          fileName,
          fileSize: fileStats.size,
          extractedAt: new Date(),
          transactionCount: mockTransactions.length,
          dateRange: {
            start: mockTransactions[0]?.date || null,
            end: mockTransactions[mockTransactions.length - 1]?.date || null
          }
        }
      };

      logger.info(`PDF extraction completed. Found ${result.transactions.length} transactions`);
      return result;

    } catch (error) {
      logger.error('PDF extraction failed:', error);
      throw new Error(`Failed to extract transactions from PDF: ${error.message}`);
    }
  }

  /**
   * Generate mock transactions for testing
   * @returns {Array} Array of mock transaction objects
   */
  generateMockTransactions() {
    const baseDate = new Date('2024-01-01');
    const transactions = [];

    // Generate sample transactions
    const sampleTransactions = [
      { description: 'PAYROLL DEPOSIT', amount: 2500.00, type: 'CREDIT' },
      { description: 'GROCERY STORE PURCHASE', amount: -125.50, type: 'DEBIT' },
      { description: 'ATM WITHDRAWAL', amount: -200.00, type: 'DEBIT' },
      { description: 'DIRECT DEPOSIT', amount: 1000.00, type: 'CREDIT' },
      { description: 'UTILITY BILL PAYMENT', amount: -89.99, type: 'DEBIT' },
      { description: 'ONLINE TRANSFER', amount: -300.00, type: 'DEBIT' },
      { description: 'INTEREST PAYMENT', amount: 15.50, type: 'CREDIT' },
      { description: 'RESTAURANT CHARGE', amount: -45.75, type: 'DEBIT' }
    ];

    sampleTransactions.forEach((tx, index) => {
      const transactionDate = new Date(baseDate);
      transactionDate.setDate(baseDate.getDate() + index * 2);

      transactions.push({
        date: transactionDate.toISOString().split('T')[0],
        description: tx.description,
        amount: tx.amount,
        type: tx.type,
        balance: null, // Will be calculated later
        category: this.inferCategory(tx.description),
        reference: `REF${String(index + 1).padStart(3, '0')}`
      });
    });

    return transactions;
  }

  /**
   * Basic category inference from transaction description
   * @param {string} description - Transaction description
   * @returns {string} Inferred category
   */
  inferCategory(description) {
    const desc = description.toLowerCase();
    
    if (desc.includes('payroll') || desc.includes('deposit') || desc.includes('salary')) {
      return 'Income';
    }
    if (desc.includes('grocery') || desc.includes('food') || desc.includes('restaurant')) {
      return 'Food & Dining';
    }
    if (desc.includes('atm') || desc.includes('withdrawal') || desc.includes('cash')) {
      return 'Cash & ATM';
    }
    if (desc.includes('utility') || desc.includes('electric') || desc.includes('gas')) {
      return 'Utilities';
    }
    if (desc.includes('transfer')) {
      return 'Transfer';
    }
    if (desc.includes('interest')) {
      return 'Interest';
    }
    
    return 'Other';
  }

  /**
   * Validate PDF file format
   * @param {string} filePath - Path to file to validate
   * @returns {Promise<boolean>} True if valid PDF
   */
  async validatePdfFile(filePath) {
    try {
      const fileBuffer = await fs.readFile(filePath);
      
      // Check PDF magic number
      const pdfHeader = fileBuffer.slice(0, 4).toString();
      return pdfHeader === '%PDF';
      
    } catch (error) {
      logger.error('PDF validation failed:', error);
      return false;
    }
  }
}

export default new PdfService();
