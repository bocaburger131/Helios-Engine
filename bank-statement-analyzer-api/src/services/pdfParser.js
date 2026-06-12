import pdf from 'pdf-parse';
import logger from '../utils/logger.js';

export async function parsePDF(buffer) {
  try {
    const data = await pdf(buffer);
    
    // Extract page information
    const pageInfo = extractPageInfo(data);
    
    // Validate page sequence
    const pageValidation = validatePages(pageInfo);
    
    if (!pageValidation.isValid) {
      throw new Error(pageValidation.error);
    }
    
    // Log page information
    logger.info(`PDF parsed successfully: ${pageInfo.totalPages} pages found`);
    
    // Extract transactions with page tracking
    const transactions = extractTransactions(data.text, pageInfo);
    
    // Extract summary information
    const summary = extractSummary(data.text);
    
    return {
      transactions,
      summary,
      pageInfo: {
        totalPages: pageInfo.totalPages,
        pageNumbers: pageInfo.pageNumbers,
        missingPages: pageValidation.missingPages || [],
        isComplete: pageValidation.isValid
      },
      rawText: data.text
    };
  } catch (error) {
    logger.error('PDF parsing error:', error);
    throw new Error(`Failed to parse PDF: ${error.message}`);
  }
}

function extractPageInfo(pdfData) {
  const pageInfo = {
    totalPages: pdfData.numpages,
    pageNumbers: [],
    expectedPages: null
  };
  
  // Try to extract page numbers from the text
  const pagePattern = /page\s*(\d+)\s*of\s*(\d+)/gi;
  const matches = [...pdfData.text.matchAll(pagePattern)];
  
  if (matches.length > 0) {
    // Extract unique page numbers and expected total
    const pageNumbersSet = new Set();
    matches.forEach(match => {
      const currentPage = parseInt(match[1]);
      const totalPages = parseInt(match[2]);
      pageNumbersSet.add(currentPage);
      pageInfo.expectedPages = totalPages;
    });
    pageInfo.pageNumbers = Array.from(pageNumbersSet).sort((a, b) => a - b);
  } else {
    // Fallback: try alternative patterns
    const altPattern1 = /(\d+)\s*\/\s*(\d+)/g; // Format: 1/6, 2/6, etc.
    const altPattern2 = /page\s*(\d+)/gi; // Format: Page 1, Page 2, etc.
    
    const altMatches1 = [...pdfData.text.matchAll(altPattern1)];
    const altMatches2 = [...pdfData.text.matchAll(altPattern2)];
    
    if (altMatches1.length > 0) {
      const pageNumbersSet = new Set();
      altMatches1.forEach(match => {
        const currentPage = parseInt(match[1]);
        const totalPages = parseInt(match[2]);
        // Filter out dates or other number patterns
        if (currentPage <= totalPages && currentPage <= 100) {
          pageNumbersSet.add(currentPage);
          pageInfo.expectedPages = totalPages;
        }
      });
      pageInfo.pageNumbers = Array.from(pageNumbersSet).sort((a, b) => a - b);
    } else if (altMatches2.length > 0) {
      const pageNumbersSet = new Set();
      altMatches2.forEach(match => {
        const pageNum = parseInt(match[1]);
        if (pageNum <= 100) { // Reasonable page limit
          pageNumbersSet.add(pageNum);
        }
      });
      pageInfo.pageNumbers = Array.from(pageNumbersSet).sort((a, b) => a - b);
    }
  }
  
  // If we couldn't extract page numbers, assume sequential pages
  if (pageInfo.pageNumbers.length === 0) {
    for (let i = 1; i <= pageInfo.totalPages; i++) {
      pageInfo.pageNumbers.push(i);
    }
  }
  
  return pageInfo;
}

function validatePages(pageInfo) {
  const validation = {
    isValid: true,
    error: null,
    missingPages: []
  };
  
  // If we have expected pages info, validate against it
  if (pageInfo.expectedPages) {
    if (pageInfo.totalPages < pageInfo.expectedPages) {
      validation.isValid = false;
      validation.error = `Missing pages detected: Found ${pageInfo.totalPages} pages but document indicates ${pageInfo.expectedPages} total pages`;
      
      // Find which pages are missing
      for (let i = 1; i <= pageInfo.expectedPages; i++) {
        if (!pageInfo.pageNumbers.includes(i)) {
          validation.missingPages.push(i);
        }
      }
      
      if (validation.missingPages.length > 0) {
        validation.error += `. Missing page(s): ${validation.missingPages.join(', ')}`;
      }
    }
  }
  
  // Check for page sequence gaps
  if (pageInfo.pageNumbers.length > 1) {
    for (let i = 1; i < pageInfo.pageNumbers.length; i++) {
      if (pageInfo.pageNumbers[i] - pageInfo.pageNumbers[i-1] > 1) {
        const gap = pageInfo.pageNumbers[i] - pageInfo.pageNumbers[i-1] - 1;
        if (!validation.error) {
          validation.isValid = false;
          validation.error = `Page sequence gap detected: ${gap} page(s) missing between page ${pageInfo.pageNumbers[i-1]} and ${pageInfo.pageNumbers[i]}`;
        }
      }
    }
  }
  
  return validation;
}

function extractTransactions(text, pageInfo) {
  const transactions = [];
  const lines = text.split('\n');
  
  // Common transaction patterns
  const datePatterns = [
    /(\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4})/,
    /(\d{4}[-\/]\d{1,2}[-\/]\d{1,2})/,
    /(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2},?\s+\d{4}/i
  ];
  
  let currentPage = 1;
  let pageMarkerIndex = 0;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
    // Track current page
    if (line.match(/page\s*\d+/i)) {
      const pageMatch = line.match(/page\s*(\d+)/i);
      if (pageMatch) {
        currentPage = parseInt(pageMatch[1]);
      }
    }
    
    // Skip empty lines and headers
    if (!line || line.length < 10) continue;
    
    // Try to match transaction patterns
    let matched = false;
    for (const pattern of datePatterns) {
      if (pattern.test(line)) {
        const transaction = parseTransactionLine(line, currentPage);
        if (transaction) {
          transactions.push(transaction);
          matched = true;
          break;
        }
      }
    }
  }
  
  return transactions;
}

function parseTransactionLine(line, pageNumber) {
  // Parse a single transaction line
  // This is a simplified version - adjust based on your bank's format
  const parts = line.split(/\s{2,}/); // Split by multiple spaces
  
  if (parts.length < 3) return null;
  
  try {
    const dateStr = parts[0];
    const description = parts[1];
    
    // Find amount and balance
    let amount = 0;
    let balance = 0;
    
    // Look for monetary values (negative or positive)
    const moneyPattern = /-?\$?[\d,]+\.?\d*/g;
    const moneyMatches = line.match(moneyPattern);
    
    if (moneyMatches && moneyMatches.length >= 1) {
      amount = parseFloat(moneyMatches[0].replace(/[$,]/g, ''));
      if (moneyMatches.length >= 2) {
        balance = parseFloat(moneyMatches[moneyMatches.length - 1].replace(/[$,]/g, ''));
      }
    }
    
    return {
      date: dateStr,
      description: description.trim(),
      amount,
      balance,
      page: pageNumber,
      rawText: line
    };
  } catch (error) {
    logger.warn(`Failed to parse transaction line: ${line}`);
    return null;
  }
}

function extractSummary(text) {
  const summary = {
    accountNumber: null,
    period: { start: null, end: null },
    openingBalance: 0,
    closingBalance: 0,
    totalDeposits: 0,
    totalWithdrawals: 0
  };
  
  // Extract account number
  const accountPattern = /account\s*(?:number|#|no\.?)?\s*:?\s*([\d\-]+)/i;
  const accountMatch = text.match(accountPattern);
  if (accountMatch) {
    summary.accountNumber = accountMatch[1];
  }
  
  // Extract period
  const periodPattern = /(?:period|statement\s*period)\s*:?\s*([^to]+)\s*to\s*([^\n]+)/i;
  const periodMatch = text.match(periodPattern);
  if (periodMatch) {
    summary.period.start = periodMatch[1].trim();
    summary.period.end = periodMatch[2].trim();
  }
  
  // Extract balances
  const openingPattern = /(?:opening|beginning|previous)\s*balance\s*:?\s*\$?([\d,]+\.?\d*)/i;
  const closingPattern = /(?:closing|ending|new)\s*balance\s*:?\s*\$?([\d,]+\.?\d*)/i;
  
  const openingMatch = text.match(openingPattern);
  const closingMatch = text.match(closingPattern);
  
  if (openingMatch) {
    summary.openingBalance = parseFloat(openingMatch[1].replace(/,/g, ''));
  }
  if (closingMatch) {
    summary.closingBalance = parseFloat(closingMatch[1].replace(/,/g, ''));
  }
  
  return summary;
}
