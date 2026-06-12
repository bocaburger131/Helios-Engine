import pdf from 'pdf-parse';
import { AppError } from './appError.js';

class PDFTextExtractor {
  async extractText(pdfBuffer) {
    try {
      const data = await pdf(pdfBuffer);
      
      if (!data.text || data.text.trim().length === 0) {
        throw new AppError('PDF contains no readable text', 422);
      }

      return {
        text: data.text,
        pages: data.numpages,
        info: data.info
      };
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      throw new AppError('Failed to extract text from PDF', 422);
    }
  }

  async validatePDFStructure(pdfBuffer) {
    try {
      const extracted = await this.extractText(pdfBuffer);
      
      // Check for bank statement indicators
      const requiredElements = [
        /account number/i,
        /balance/i,
        /transaction/i,
        /date/i
      ];

      const hasRequiredElements = requiredElements.every(pattern => 
        pattern.test(extracted.text)
      );

      if (!hasRequiredElements) {
        throw new AppError('PDF does not appear to be a valid bank statement', 422);
      }

      return extracted;
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      throw new AppError('Failed to validate PDF structure', 422);
    }
  }
}

export default new PDFTextExtractor();