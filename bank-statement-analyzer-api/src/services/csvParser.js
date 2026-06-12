import { parse } from 'csv-parse/sync';
import logger from '../utils/logger.js';

export async function parseCSV(buffer) {
  try {
    const text = buffer.toString('utf-8');
    
    // Parse CSV with different strategies
    let parsedData = tryParseCSV(text);
    
    if (!parsedData || parsedData.length === 0) {
      throw new Error('No data found in CSV file');
    }
    
    // Convert CSV data to our standard format
    const transactions = [];
    const headers = Object.keys(parsedData[0]).map(h => h.toLowerCase());
    
    // Detect column mappings
    const columnMap = detectColumns(headers);
    
    let openingBalance = 0;
    let closingBalance = 0;
    
    parsedData.forEach((row, index) => {
      const transaction = parseTransaction(row, columnMap);
      if (transaction) {
        transactions.push(transaction);
        
        // Track balances
        if (index === 0 && transaction.balance) {
          openingBalance = transaction.balance - transaction.amount;
        }
        if (transaction.balance) {
          closingBalance = transaction.balance;
        }
      }
    });
    
    // Calculate summary
    const summary = calculateSummary(transactions, openingBalance, closingBalance);
    
    return {
      transactions,
      summary,
      rawData: parsedData
    };
  } catch (error) {
    logger.error('CSV parsing error:', error);
    throw new Error(`Failed to parse CSV: ${error.message}`);
  }
}

function tryParseCSV(text) {
  const parseOptions = [
    // Standard CSV
    { columns: true, skip_empty_lines: true, trim: true },
    // CSV with different delimiters
    { columns: true, skip_empty_lines: true, trim: true, delimiter: ';' },
    { columns: true, skip_empty_lines: true, trim: true, delimiter: '\t' },
    // CSV with auto-detect
    { columns: true, skip_empty_lines: true, trim: true, relax_column_count: true }
  ];
  
  for (const options of parseOptions) {
    try {
      const result = parse(text, options);
      if (result && result.length > 0) {
        return result;
      }
    } catch (e) {
      // Try next option
    }
  }
  
  throw new Error('Unable to parse CSV with any known format');
}

function detectColumns(headers) {
  const columnMap = {
    date: null,
    description: null,
    amount: null,
    debit: null,
    credit: null,
    balance: null
  };
  
  // Common column name patterns
  const patterns = {
    date: /date|posting date|transaction date|trans date/i,
    description: /description|narrative|details|memo|particular/i,
    amount: /amount|value|transaction amount/i,
    debit: /debit|withdrawal|dr|out/i,
    credit: /credit|deposit|cr|in/i,
    balance: /balance|running balance|current balance/i
  };
  
  headers.forEach((header, index) => {
    for (const [key, pattern] of Object.entries(patterns)) {
      if (pattern.test(header)) {
        columnMap[key] = index;
      }
    }
  });
  
  return columnMap;
}

function parseTransaction(row, columnMap) {
  try {
    const rowValues = Object.values(row);
    
    // Extract date
    let date = columnMap.date !== null ? rowValues[columnMap.date] : null;
    if (!date) {
      // Try to find date in any column
      for (const value of rowValues) {
        if (isValidDate(value)) {
          date = value;
          break;
        }
      }
    }
    
    if (!date) return null;
    
    // Extract description
    const description = columnMap.description !== null 
      ? rowValues[columnMap.description] 
      : rowValues.find(v => v && typeof v === 'string' && v.length > 5) || '';
    
    // Extract amount
    let amount = 0;
    if (columnMap.amount !== null) {
      amount = parseAmount(rowValues[columnMap.amount]);
    } else if (columnMap.debit !== null && columnMap.credit !== null) {
      const debit = parseAmount(rowValues[columnMap.debit]);
      const credit = parseAmount(rowValues[columnMap.credit]);
      amount = credit - debit;
    }
    
    // Extract balance
    const balance = columnMap.balance !== null 
      ? parseAmount(rowValues[columnMap.balance]) 
      : null;
    
    // Categorize transaction
    const category = categorizeTransaction(description, amount);
    
    return {
      date: normalizeDate(date),
      description: description.trim(),
      amount,
      balance,
      category,
      type: amount >= 0 ? 'credit' : 'debit'
    };
  } catch (error) {
    logger.warn('Failed to parse transaction row:', error);
    return null;
  }
}

function isValidDate(value) {
  if (!value) return false;
  const date = new Date(value);
  return date instanceof Date && !isNaN(date);
}

function normalizeDate(dateStr) {
  const date = new Date(dateStr);
  return date.toISOString().split('T')[0];
}

function parseAmount(value) {
  if (!value) return 0;
  const cleaned = value.toString().replace(/[$,]/g, '').trim();
  const amount = parseFloat(cleaned);
  return isNaN(amount) ? 0 : amount;
}

function categorizeTransaction(description, amount) {
  const desc = description.toLowerCase();
  
  const categories = {
    'Salary': /salary|payroll|wages|income/i,
    'Groceries': /grocery|supermarket|walmart|costco|safeway|kroger/i,
    'Dining': /restaurant|cafe|coffee|starbucks|mcdonald|pizza/i,
    'Utilities': /electric|water|gas|internet|phone|utility/i,
    'Transportation': /gas station|uber|lyft|taxi|parking|toll/i,
    'Shopping': /amazon|ebay|online|store|shop/i,
    'Entertainment': /movie|netflix|spotify|game|theater/i,
    'Healthcare': /pharmacy|doctor|hospital|medical|dental/i,
    'Insurance': /insurance|premium/i,
    'Transfer': /transfer|payment|withdrawal|deposit/i
  };
  
  for (const [category, pattern] of Object.entries(categories)) {
    if (pattern.test(desc)) {
      return category;
    }
  }
  
  return amount > 0 ? 'Income' : 'Other';
}

function calculateSummary(transactions, openingBalance, closingBalance) {
  const deposits = transactions.filter(t => t.amount > 0);
  const withdrawals = transactions.filter(t => t.amount < 0);
  
  const totalDeposits = deposits.reduce((sum, t) => sum + t.amount, 0);
  const totalWithdrawals = Math.abs(withdrawals.reduce((sum, t) => sum + t.amount, 0));
  
  // Get date range
  const dates = transactions.map(t => new Date(t.date)).filter(d => !isNaN(d));
  const startDate = dates.length > 0 ? new Date(Math.min(...dates)) : new Date();
  const endDate = dates.length > 0 ? new Date(Math.max(...dates)) : new Date();
  
  // If no opening balance from transactions, calculate it
  if (!openingBalance && transactions.length > 0 && transactions[0].balance) {
    openingBalance = transactions[0].balance - transactions[0].amount;
  }
  
  // If no closing balance, use last transaction balance
  if (!closingBalance && transactions.length > 0) {
    const lastTransaction = transactions[transactions.length - 1];
    closingBalance = lastTransaction.balance || (openingBalance + totalDeposits - totalWithdrawals);
  }
  
  return {
    period: {
      start: startDate.toISOString().split('T')[0],
      end: endDate.toISOString().split('T')[0]
    },
    openingBalance: openingBalance || 0,
    closingBalance: closingBalance || 0,
    totalDeposits,
    totalWithdrawals,
    transactionCount: transactions.length,
    depositCount: deposits.length,
    withdrawalCount: withdrawals.length
  };
}