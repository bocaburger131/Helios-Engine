import fs from 'fs/promises';
import path from 'path';
import csv from 'csv-parser';
import { createReadStream } from 'fs';

export async function processCSV(filePath) {
  const transactions = [];
  
  return new Promise((resolve, reject) => {
    createReadStream(filePath)
      .pipe(csv())
      .on('data', (row) => {
        transactions.push({
          date: row.Date,
          description: row.Description,
          debit: parseFloat(row.Debit) || 0,
          credit: parseFloat(row.Credit) || 0
        });
      })
      .on('end', () => {
        const summary = {
          totalTransactions: transactions.length,
          totalDebits: transactions.reduce((sum, t) => sum + t.debit, 0),
          totalCredits: transactions.reduce((sum, t) => sum + t.credit, 0),
          balance: transactions.reduce((sum, t) => sum + t.credit - t.debit, 0),
          transactions: transactions
        };
        resolve(summary);
      })
      .on('error', reject);
  });
}