/**
 * @license
 * Copyright (c) 2025 Shift 4 Financial INC 
 * This code is licensed under the MIT License.
 * See LICENSE file for details.
 */

import logger from './logger.js';

/**
 * Parse bank statement text and extract structured data
 * @param {string} text - Raw text from PDF
 * @returns {Object} Parsed statement data
 */
export function parseStatement(text) {
  try {
    const lines = text.split('\n').map(line => line.trim()).filter(line => line);
    
    const parsedData = {
      bankName: detectBankName(text),
      accountNumber: extractAccountNumber(text),
      period: extractPeriod(text),
      transactions: extractTransactions(lines)
    };
    
    logger.info(`Parsed statement: ${parsedData.transactions.length} transactions found`);
    return parsedData;
  } catch (error) {
    logger.error('Error parsing statement:', error);
    throw new Error('Failed to parse statement');
  }
}

function detectBankName(text) {
  const bankPatterns = {
    'Bank of America': /bank\s*of\s*america/i,
    'Chase': /chase\s*bank|jpmorgan\s*chase/i,
    'Wells Fargo': /wells\s*fargo/i,
    'Citibank': /citibank|citi\s*bank/i,
    'US Bank': /us\s*bank|u\.s\.\s*bank/i,
    'PNC Bank': /pnc\s*bank/i,
    'Capital One': /capital\s*one/i,
    'TD Bank': /td\s*bank/i,
    'BB&T': /bb&t|truist/i,
    'SunTrust': /suntrust/i
  };
  
  for (const [bankName, pattern] of Object.entries(bankPatterns)) {
    if (pattern.test(text)) {
      return bankName;
    }
  }
  
  return 'Unknown Bank';
}

function extractAccountNumber(text) {
  // Common patterns for account numbers
  const patterns = [
    /account\s*(?:number|#|no\.?)[\s:]*([0-9X*-]+)/i,
    /account\s*ending\s*in\s*([0-9]+)/i,
    /\*{4,}([0-9]{4})/
  ];
  
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      return match[1];
    }
  }
  
  return 'Unknown';
}

function extractPeriod(text) {
  // Common date range patterns
  const patterns = [
    /statement\s*period[\s:]*([A-Za-z]+\s*\d{1,2},?\s*\d{4})\s*(?:to|-)\s*([A-Za-z]+\s*\d{1,2},?\s*\d{4})/i,
    /from\s*([A-Za-z]+\s*\d{1,2},?\s*\d{4})\s*(?:to|through)\s*([A-Za-z]+\s*\d{1,2},?\s*\d{4})/i,
    /(\d{1,2}\/\d{1,2}\/\d{2,4})\s*(?:to|-)\s*(\d{1,2}\/\d{1,2}\/\d{2,4})/
  ];
  
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      return {
        startDate: parseDate(match[1]),
        endDate: parseDate(match[2])
      };
    }
  }
  
  // Default to current month
  const now = new Date();
  const startDate = new Date(now.getFullYear(), now.getMonth(), 1);
  const endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  
  return { startDate, endDate };
}

function parseDate(dateStr) {
  try {
    return new Date(dateStr);
  } catch (error) {
    return new Date();
  }
}

function extractTransactions(lines) {
  const transactions = [];
  
  // Common transaction patterns
  const transactionPatterns = [
    // MM/DD description amount
    /^(\d{1,2}\/\d{1,2})\s+(.+?)\s+(-?\$?[\d,]+\.?\d*)\s*$/,
    // MM/DD/YY description amount
    /^(\d{1,2}\/\d{1,2}\/\d{2,4})\s+(.+?)\s+(-?\$?[\d,]+\.?\d*)\s*$/,
    // date description debit credit balance
    /^(\d{1,2}\/\d{1,2})\s+(.+?)\s+(-?\$?[\d,]+\.?\d*)\s+(-?\$?[\d,]+\.?\d*)?\s+(-?\$?[\d,]+\.?\d*)\s*$/
  ];
  
  for (const line of lines) {
    for (const pattern of transactionPatterns) {
      const match = line.match(pattern);
      if (match) {
        const date = parseTransactionDate(match[1]);
        const description = match[2].trim();
        const amount = parseAmount(match[3]);
        
        if (date && description && !isNaN(amount)) {
          transactions.push({
            date,
            description,
            amount,
            category: categorizeTransaction(description, amount)
          });
        }
        break;
      }
    }
  }
  
  return transactions;
}

function parseTransactionDate(dateStr) {
  const currentYear = new Date().getFullYear();
  let date;
  
  if (dateStr.includes('/')) {
    const parts = dateStr.split('/');
    if (parts.length === 2) {
      // MM/DD format - assume current year
      date = new Date(currentYear, parseInt(parts[0]) - 1, parseInt(parts[1]));
    } else if (parts.length === 3) {
      // MM/DD/YY or MM/DD/YYYY format
      const year = parts[2].length === 2 ? 2000 + parseInt(parts[2]) : parseInt(parts[2]);
      date = new Date(year, parseInt(parts[0]) - 1, parseInt(parts[1]));
    }
  }
  
  return date || new Date();
}

function parseAmount(amountStr) {
  // Remove currency symbols and commas
  const cleanAmount = amountStr.replace(/[$,]/g, '');
  return parseFloat(cleanAmount);
}

function categorizeTransaction(description, amount) {
  const descLower = description.toLowerCase();
  
  // Income categories (positive amounts)
  if (amount > 0) {
    if (/salary|payroll|wages|income/i.test(description)) return 'Salary';
    if (/refund|return/i.test(description)) return 'Refund';
    if (/transfer|deposit/i.test(description)) return 'Transfer';
    return 'Other Income';
  }
  
  // Expense categories (negative amounts)
  const categories = {
    'Groceries': /grocery|supermarket|whole foods|trader joe|kroger|safeway|walmart|target/i,
    'Restaurants': /restaurant|pizza|burger|coffee|starbucks|mcdonald|subway|chipotle/i,
    'Gas': /gas station|shell|exxon|chevron|bp|fuel/i,
    'Utilities': /electric|gas|water|internet|cable|phone|verizon|at&t|comcast/i,
    'Shopping': /amazon|ebay|store|shop|mall/i,
    'Entertainment': /movie|cinema|netflix|spotify|game|theater/i,
    'Healthcare': /pharmacy|doctor|hospital|medical|cvs|walgreens/i,
    'Insurance': /insurance|geico|allstate|progressive/i,
    'Banking Fees': /fee|charge|overdraft/i,
    'ATM': /atm|cash withdrawal/i,
    'Transportation': /uber|lyft|taxi|parking|toll/i
  };
  
  for (const [category, pattern] of Object.entries(categories)) {
    if (pattern.test(descLower)) {
      return category;
    }
  }
  
  return 'Other';
}

export default {
  parseStatement
};