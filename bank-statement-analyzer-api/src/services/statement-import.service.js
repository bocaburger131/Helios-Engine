import fs from 'fs';
import path from 'path';
import csv from 'csv-parser';
import { v4 as uuidv4 } from 'uuid';
import { StatementModel } from '../models/statement/Statement.js';
import { TransactionModel } from '../models/transaction/Transaction.js';

export class StatementImportService {
  /**
   * Process a CSV statement file
   * @param {Object} options - Import options
   * @param {string} options.filePath - Path to the CSV file
   * @param {string} options.userId - User ID
   * @param {string} options.bankName - Bank name
   * @param {string} options.accountName - Account name
   * @param {string} options.accountType - Account type (checking, savings, etc.)
   * @param {string} options.format - Bank format (for CSV mapping)
   */
  static async importStatement(options) {
    const {
      filePath,
      userId,
      bankName,
      accountName,
      accountType = 'checking',
      format = 'generic'
    } = options;
    
    // Create a new statement record
    const statement = await StatementModel.create({
      userId,
      bankName,
      accountName,
      accountType,
      fileName: path.basename(filePath),
      uploadDate: new Date(),
      status: 'processing'
    });
    
    return new Promise((resolve, reject) => {
      const transactions = [];
      let totalCredits = 0;
      let totalDebits = 0;
      let earliestDate = null;
      let latestDate = null;
      
      fs.createReadStream(filePath)
        .pipe(csv())
        .on('data', (row) => {
          try {
            // Map CSV data to transaction fields based on bank format
            const transaction = this.mapRowToTransaction(row, format, userId, statement._id);
            
            if (transaction) {
              // Track statement date range
              if (!earliestDate || transaction.date < earliestDate) {
                earliestDate = transaction.date;
              }
              
              if (!latestDate || transaction.date > latestDate) {
                latestDate = transaction.date;
              }
              
              // Track totals
              if (transaction.type === 'credit') {
                totalCredits += transaction.amount;
              } else {
                totalDebits += transaction.amount;
              }
              
              transactions.push(transaction);
            }
          } catch (error) {
            console.error('Error processing row:', error, row);
          }
        })
        .on('end', async () => {
          try {
            // Save all transactions
            if (transactions.length > 0) {
              await TransactionModel.insertMany(transactions);
            }
            
            // Update statement with summary data
            await StatementModel.findByIdAndUpdate(statement._id, {
              status: 'completed',
              transactionCount: transactions.length,
              totalCredits,
              totalDebits,
              startDate: earliestDate,
              endDate: latestDate
            });
            
            resolve({
              statementId: statement._id,
              transactionCount: transactions.length,
              totalCredits,
              totalDebits,
              startDate: earliestDate,
              endDate: latestDate
            });
          } catch (error) {
            // Update statement with error status
            await StatementModel.findByIdAndUpdate(statement._id, {
              status: 'error',
              errorMessage: error.message
            });
            
            reject(error);
          }
        })
        .on('error', async (error) => {
          // Update statement with error status
          await StatementModel.findByIdAndUpdate(statement._id, {
            status: 'error',
            errorMessage: error.message
          });
          
          reject(error);
        });
    });
  }
  
  /**
   * Map CSV row to transaction data based on bank format
   */
  static mapRowToTransaction(row, format, userId, statementId) {
    // Get mapping function for the specified bank format
    const mapper = this.getFormatMapper(format);
    
    if (!mapper) {
      throw new Error(`Unsupported bank format: ${format}`);
    }
    
    // Map row data to transaction
    const transactionData = mapper(row);
    
    if (!transactionData) {
      return null; // Skip this row
    }
    
    // Add common fields
    transactionData.userId = userId;
    transactionData.statementId = statementId;
    
    return transactionData;
  }
  
  /**
   * Get the appropriate mapper function for a bank format
   */
  static getFormatMapper(format) {
    const formatMappers = {
      'chase': this.mapChaseFormat,
      'bank-of-america': this.mapBankOfAmericaFormat,
      'wells-fargo': this.mapWellsFargoFormat,
      'generic': this.mapGenericFormat
    };
    
    return formatMappers[format.toLowerCase()] || formatMappers.generic;
  }
  
  /**
   * Map Chase bank statement format
   */
  static mapChaseFormat(row) {
    // Skip rows that don't have required fields
    if (!row['Transaction Date'] || !row['Description'] || !row['Amount']) {
      return null;
    }
    
    const amount = parseFloat(row['Amount'].replace(/[^0-9.-]/g, ''));
    
    return {
      date: new Date(row['Transaction Date']),
      description: row['Description'],
      amount: Math.abs(amount),
      type: amount >= 0 ? 'credit' : 'debit',
      category: this.guessCategory(row['Description']),
      notes: row['Notes'] || ''
    };
  }
  
  /**
   * Map Bank of America statement format
   */
  static mapBankOfAmericaFormat(row) {
    // Skip rows that don't have required fields
    if (!row['Date'] || !row['Description'] || !row['Amount']) {
      return null;
    }
    
    const amount = parseFloat(row['Amount'].replace(/[^0-9.-]/g, ''));
    
    return {
      date: new Date(row['Date']),
      description: row['Description'],
      amount: Math.abs(amount),
      type: amount >= 0 ? 'credit' : 'debit',
      category: this.guessCategory(row['Description']),
      notes: row['Notes'] || ''
    };
  }
  
  /**
   * Map Wells Fargo statement format
   */
  static mapWellsFargoFormat(row) {
    // Skip rows that don't have required fields
    if (!row['Date'] || !row['Description'] || !row['Amount']) {
      return null;
    }
    
    const amount = parseFloat(row['Amount'].replace(/[^0-9.-]/g, ''));
    
    return {
      date: new Date(row['Date']),
      description: row['Description'],
      amount: Math.abs(amount),
      type: row['Type'] === 'credit' ? 'credit' : 'debit',
      category: this.guessCategory(row['Description']),
      notes: row['Notes'] || ''
    };
  }
  
  /**
   * Map generic CSV format
   */
  static mapGenericFormat(row) {
    // Try to find date field
    const dateField = this.findField(row, ['Date', 'Transaction Date', 'TransactionDate']);
    
    // Try to find description field
    const descField = this.findField(row, ['Description', 'Memo', 'Payee', 'Transaction']);
    
    // Try to find amount field
    const amountField = this.findField(row, ['Amount', 'Transaction Amount', 'Value']);
    
    // Skip rows that don't have required fields
    if (!row[dateField] || !row[descField] || !row[amountField]) {
      return null;
    }
    
    // Parse amount and determine transaction type
    let amount = parseFloat(row[amountField].replace(/[^0-9.-]/g, ''));
    let type = 'debit';
    
    // Check if we have separate credit/debit columns
    const creditField = this.findField(row, ['Credit', 'Deposit']);
    const debitField = this.findField(row, ['Debit', 'Withdrawal']);
    
    if (creditField && row[creditField] && parseFloat(row[creditField]) > 0) {
      amount = parseFloat(row[creditField]);
      type = 'credit';
    } else if (debitField && row[debitField] && parseFloat(row[debitField]) > 0) {
      amount = parseFloat(row[debitField]);
      type = 'debit';
    } else {
      // If no explicit credit/debit columns, use sign of amount
      type = amount >= 0 ? 'credit' : 'debit';
      amount = Math.abs(amount);
    }
    
    return {
      date: new Date(row[dateField]),
      description: row[descField],
      amount,
      type,
      category: this.guessCategory(row[descField])
    };
  }
  
  /**
   * Find a field in the row that matches one of the possible names
   */
  static findField(row, possibleNames) {
    for (const name of possibleNames) {
      if (row[name] !== undefined) {
        return name;
      }
    }
    return null;
  }
  
  /**
   * Guess transaction category based on description
   */
  static guessCategory(description) {
    if (!description) return 'Uncategorized';
    
    const descLower = description.toLowerCase();
    
    // Simple category matching based on keywords
    const categoryMatches = [
      { category: 'Groceries', keywords: ['grocery', 'supermarket', 'food', 'market', 'wholefood'] },
      { category: 'Dining', keywords: ['restaurant', 'cafe', 'bar', 'starbucks', 'mcdonald', 'burger', 'pizza'] },
      { category: 'Transportation', keywords: ['gas', 'fuel', 'uber', 'lyft', 'taxi', 'transit', 'parking', 'train'] },
      { category: 'Shopping', keywords: ['amazon', 'walmart', 'target', 'store', 'shop', 'retail'] },
      { category: 'Utilities', keywords: ['electric', 'water', 'utility', 'phone', 'mobile', 'internet', 'cable', 'bill'] },
      { category: 'Entertainment', keywords: ['movie', 'theatre', 'netflix', 'spotify', 'disney', 'hulu', 'game'] },
      { category: 'Health', keywords: ['doctor', 'medical', 'pharmacy', 'fitness', 'gym'] },
      { category: 'Income', keywords: ['salary', 'payroll', 'deposit', 'income', 'payment', 'direct dep'] }
    ];
    
    for (const { category, keywords } of categoryMatches) {
      if (keywords.some(keyword => descLower.includes(keyword))) {
        return category;
      }
    }
    
    return 'Uncategorized';
  }
  
  /**
   * Save an uploaded file to disk
   */
  static async saveUploadedFile(fileBuffer, originalFilename) {
    const uploadDir = path.resolve('./uploads');
    
    // Ensure upload directory exists
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    
    // Create a unique filename
    const uniqueFilename = `${uuidv4()}-${originalFilename}`;
    const filePath = path.join(uploadDir, uniqueFilename);
    
    // Write file to disk
    await fs.promises.writeFile(filePath, fileBuffer);
    
    return filePath;
  }
}