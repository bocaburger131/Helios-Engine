import { fileUploadService } from './fileUpload.service.js';
import { documentParserService } from './documentParser.service.js';
import { statementExtractorService } from './statementExtractor.service.js';
import { transactionEnrichmentService } from './transactionEnrichment.service.js';
import { statementRepository } from '../repositories/statement.repository.js';
import { AppError } from '../utils/errors.js';
import path from 'path';

export class StatementProcessingService {
  /**
   * Process a new bank statement
   * @param {Object} file - Uploaded file
   * @param {String} userId - User ID
   * @returns {Object} Processing result with statement ID
   */
  async processStatement(file, userId) {
    // 1. Store the uploaded file
    const fileInfo = await fileUploadService.storeFile(file, userId);
    
    // 2. Create initial statement record
    const initialStatement = await statementRepository.create({
      userId,
      originalFilename: fileInfo.originalName,
      parseStatus: 'processing'
    });
    
    // Process asynchronously
    this.processStatementAsync(fileInfo.path, initialStatement._id, userId)
      .catch(error => {
        console.error('Statement processing failed:', error);
        // Update statement with error
        statementRepository.updateParseStatus(
          initialStatement._id, 
          'failed', 
          error.message
        );
      });
    
    return {
      statementId: initialStatement._id,
      status: 'processing'
    };
  }
  
  /**
   * Asynchronous statement processing pipeline
   * @param {String} filePath - Path to the statement file
   * @param {String} statementId - ID of the statement record
   * @param {String} userId - User ID
   */
  async processStatementAsync(filePath, statementId, userId) {
    try {
      // 1. Parse the PDF
      const parsedDocument = await documentParserService.parsePdf(filePath);
      
      // 2. Identify the bank
      const bankId = statementExtractorService.identifyBank(parsedDocument.textContent);
      
      // 3. Extract statement data
      const extractedData = await statementExtractorService.extractStatementData(
        parsedDocument.textContent, 
        bankId
      );
      
      // 4. Categorize transactions
      const categorizedTransactions = await transactionEnrichmentService.categorizeTransactions(
        extractedData.transactions
      );
      
      // 5. Update the statement record with extracted data
      const updatedStatement = await statementRepository.updateById(
        statementId,
        {
          bankName: extractedData.bankName || 'Unknown Bank',
          accountNumber: extractedData.accountNumber,
          statementPeriod: extractedData.statementPeriod,
          openingBalance: extractedData.openingBalance,
          closingBalance: extractedData.closingBalance,
          transactions: categorizedTransactions,
          parseStatus: 'completed'
        }
      );
      
      return updatedStatement;
    } catch (error) {
      // Update statement with error
      await statementRepository.updateParseStatus(
        statementId, 
        'failed', 
        error.message
      );
      
      throw error;
    } finally {
      // Clean up temporary files
      try {
        // Keep the original uploaded file, but remove any intermediate files
        const dirName = path.dirname(filePath);
        const tempFiles = path.join(dirName, 'temp_*');
        // Remove temp files if any
      } catch (e) {
        console.error('Error cleaning up temp files:', e);
      }
    }
  }
  
  /**
   * Get processing status for a statement
   * @param {String} statementId - Statement ID
   * @returns {Object} Processing status
   */
  async getProcessingStatus(statementId) {
    const statement = await statementRepository.findById(statementId);
    
    if (!statement) {
      throw new AppError('Statement not found', 404);
    }
    
    return {
      statementId: statement._id,
      status: statement.parseStatus,
      error: statement.parseError
    };
  }
}

export const statementProcessingService = new StatementProcessingService();