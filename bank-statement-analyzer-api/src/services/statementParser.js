import { parseCSV } from './csvParser.js';
import { parsePDF } from './pdfParser.js';
import logger from '../utils/logger.js';

export async function parseStatement(buffer, mimetype, filename) {
  try {
    logger.info(`Parsing statement: ${filename} (${mimetype})`);
    
    let parsedData;
    
    if (mimetype === 'text/csv' || filename.endsWith('.csv')) {
      parsedData = await parseCSV(buffer);
    } else if (mimetype === 'application/pdf' || filename.endsWith('.pdf')) {
      parsedData = await parsePDF(buffer);
      
      // Check if pages are missing
      if (parsedData.pageInfo && !parsedData.pageInfo.isComplete) {
        logger.warn(`Incomplete PDF detected: ${parsedData.pageInfo.missingPages.length} missing pages`);
        
        // You can decide whether to throw an error or just warn
        // Option 1: Throw error to prevent processing incomplete statements
        throw new Error(`Incomplete bank statement: ${parsedData.pageInfo.missingPages.length} page(s) missing. Missing pages: ${parsedData.pageInfo.missingPages.join(', ')}`);
        
        // Option 2: Add warning to the response but continue processing
        // parsedData.warnings = parsedData.warnings || [];
        // parsedData.warnings.push({
        //   type: 'MISSING_PAGES',
        //   message: `Statement appears to be incomplete. Missing pages: ${parsedData.pageInfo.missingPages.join(', ')}`,
        //   severity: 'HIGH'
        // });
      }
    } else {
      throw new Error('Unsupported file type');
    }
    
    // Validate parsed data
    validateParsedData(parsedData);
    
    // Add metadata
    parsedData.metadata = {
      filename,
      mimetype,
      parsedAt: new Date(),
      pageInfo: parsedData.pageInfo || null
    };
    
    return parsedData;
  } catch (error) {
    logger.error('Statement parsing error:', error);
    throw error;
  }
}

function validateParsedData(data) {
  if (!data.transactions || !Array.isArray(data.transactions)) {
    throw new Error('Invalid parsed data: transactions array is required');
  }
  
  if (data.transactions.length === 0) {
    throw new Error('No transactions found in the statement');
  }
  
  if (!data.summary) {
    throw new Error('Invalid parsed data: summary is required');
  }
  
  // Additional validation for page completeness
  if (data.pageInfo && data.pageInfo.missingPages && data.pageInfo.missingPages.length > 0) {
    logger.warn(`Statement has missing pages: ${data.pageInfo.missingPages.join(', ')}`);
  }
  
  return true;
}