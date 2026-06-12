import csv from 'csv-parser';
import { Readable } from 'stream';

export class CSVParser {
  constructor(options = {}) {
    this.options = {
      separator: ',',
      headers: true,
      skipEmptyLines: true,
      ...options
    };
  }

  async parse(buffer) {
    return new Promise((resolve, reject) => {
      const results = [];
      const stream = Readable.from(buffer);
      
      stream
        .pipe(csv(this.options))
        .on('data', (data) => results.push(data))
        .on('end', () => resolve(results))
        .on('error', reject);
    });
  }

  async parseStatementCSV(buffer) {
    const transactions = await this.parse(buffer);
    
    return transactions.map(row => ({
      date: this.parseDate(row.Date || row.date),
      description: row.Description || row.description || '',
      amount: this.parseAmount(row.Amount || row.amount),
      balance: this.parseAmount(row.Balance || row.balance),
      type: this.determineTransactionType(row),
      rawData: row
    }));
  }

  parseDate(dateString) {
    if (!dateString) return null;
    
    // Try common date formats
    const formats = [
      /^\d{4}-\d{2}-\d{2}$/,  // YYYY-MM-DD
      /^\d{2}\/\d{2}\/\d{4}$/, // MM/DD/YYYY
      /^\d{2}-\d{2}-\d{4}$/    // MM-DD-YYYY
    ];
    
    const date = new Date(dateString);
    return isNaN(date.getTime()) ? null : date;
  }

  parseAmount(amountString) {
    if (!amountString) return 0;
    
    // Remove currency symbols and commas
    const cleaned = amountString
      .toString()
      .replace(/[$,]/g, '')
      .trim();
    
    return parseFloat(cleaned) || 0;
  }

  determineTransactionType(row) {
    const amount = this.parseAmount(row.Amount || row.amount);
    
    if (row.Type || row.type) {
      return row.Type || row.type;
    }
    
    return amount >= 0 ? 'credit' : 'debit';
  }
}

export default new CSVParser();