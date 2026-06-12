import fs from 'fs';
import csv from 'csv-parser';
import { TransactionModel } from '../models/transaction/Transaction.js';
import { StatementModel } from '../models/statement/Statement.js';

export class StatementImporterService {
  /**
   * Process a CSV bank statement file
   */
  static async processCsvStatement(filePath, userId, bankName, accountName) {
    return new Promise(async (resolve, reject) => {
      try {
        // Create a new statement record
        const statement = await StatementModel.create({
          userId,
          bankName,
          accountName,
          fileName: filePath.split('/').pop(),
          uploadDate: new Date(),
          status: 'processing'
        });
        
        const transactions = [];
        let totalCredits = 0;
        let totalDebits = 0;
        
        // Process the CSV file
        fs.createReadStream(filePath)
          .pipe(csv())
          .on('data', (row) => {
            // Map CSV columns to transaction fields based on bank format
            const mappedTransaction = this.mapTransaction(row, bankName, userId, statement._id);
            
            if (mappedTransaction) {
              transactions.push(mappedTransaction);
              
              if (mappedTransaction.type === 'credit') {
                totalCredits += mappedTransaction.amount;
              } else {
                totalDebits += mappedTransaction.amount;
              }
            }
          })
          .on('end', async () => {
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
              startDate: transactions.length > 0 ? 
                transactions.reduce((min, t) => t.date < min ? t.date : min, transactions[0].date) : null,
              endDate: transactions.length > 0 ? 
                transactions.reduce((max, t) => t.date > max ? t.date : max, transactions[0].date) : null
            });
            
            resolve({
              statementId: statement._id,
              transactionCount: transactions.length,
              totalCredits,
              totalDebits
            });
          })
          .on('error', async (error) => {
            // Update statement with error status
            await StatementModel.findByIdAndUpdate(statement._id, {
              status: 'error',
              errorMessage: error.message
            });
            
            reject(error);
          });
      } catch (error) {
        reject(error);
      }
    });
  }
  
  /**
   * Map raw CSV data to transaction model
   * This would have different mappings for different banks
   */
  static mapTransaction(row, bankName, userId, statementId) {
    // This is a simplified example - real implementation would have
    // specific mappings for different bank formats
    
    switch (bankName.toLowerCase()) {
      case 'chase':
        return {
          userId,
          statementId,
          date: new Date(row['Transaction Date']),
          description: row['Description'],
          amount: Math.abs(parseFloat(row['Amount'])),
          type: parseFloat(row['Amount']) >= 0 ? 'credit' : 'debit',
          category: this.guessCategory(row['Description'])
        };
        
      case 'bank of america':
        return {
          userId,
          statementId,
          date: new Date(row['Date']),
          description: row['Payee'],
          amount: Math.abs(parseFloat(row['Amount'])),
          type: row['Type'] === 'credit' ? 'credit' : 'debit',
          category: this.guessCategory(row['Payee'])
        };
        
      // Add more banks as needed
        
      default:
        // Generic format
        return {
          userId,
          statementId,
          date: new Date(row['Date'] || row['TransactionDate'] || row['Transaction Date']),
          description: row['Description'] || row['Memo'] || row['Payee'] || row['Merchant'],
          amount: Math.abs(parseFloat(row['Amount'] || row['Transaction Amount'])),
          type: parseFloat(row['Amount'] || row['Transaction Amount']) >= 0 ? 'credit' : 'debit',
          category: this.guessCategory(row['Description'] || row['Memo'] || row['Payee'] || row['Merchant'])
        };
    }
  }
  
  /**
   * Simple category guesser based on keywords
   */
  static guessCategory(description) {
    if (!description) return 'Uncategorized';
    
    const descLower = description.toLowerCase();
    
    // This is a simplified example - real implementation would be more sophisticated
    if (descLower.includes('grocery') || descLower.includes('food') || descLower.includes('market')) {
      return 'Groceries';
    } else if (descLower.includes('restaurant') || descLower.includes('cafe') || descLower.includes('bar')) {
      return 'Dining';
    } else if (descLower.includes('gas') || descLower.includes('fuel') || descLower.includes('shell')) {
      return 'Transportation';
    } else if (descLower.includes('netflix') || descLower.includes('spotify') || descLower.includes('subscription')) {
      return 'Subscriptions';
    } else if (descLower.includes('amazon') || descLower.includes('walmart') || descLower.includes('target')) {
      return 'Shopping';
    } else if (descLower.includes('salary') || descLower.includes('payroll') || descLower.includes('deposit')) {
      return 'Income';
    }
    
    return 'Uncategorized';
  }
}