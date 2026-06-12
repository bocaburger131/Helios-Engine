import { PDFExtract } from 'pdf.js-extract';
import { PDFParseError } from '../utils/errors.js';

export class DocumentParserService {
  constructor() {
    this.pdfExtract = new PDFExtract();
  }
  
  /**
   * Extract text content from a PDF file
   * @param {String} filePath - Path to the PDF file
   * @returns {Object} Extracted content
   */
  async parsePdf(filePath) {
    try {
      const result = await this.pdfExtract.extract(filePath, {});
      
      if (!result || !result.pages || result.pages.length === 0) {
        throw new PDFParseError('No content found in PDF file');
      }
      
      // Extract text content from all pages
      const textContent = result.pages.map(page => {
        return page.content
          .sort((a, b) => {
            // Sort by y position first (rows), then x position (columns)
            if (Math.abs(a.y - b.y) < 5) { // Same row (with tolerance)
              return a.x - b.x;
            }
            return a.y - b.y;
          })
          .map(item => item.str)
          .join(' ');
      }).join('\n\n');
      
      return {
        pageCount: result.pages.length,
        textContent,
        metadata: result.metadata || {},
        raw: result
      };
    } catch (error) {
      throw new PDFParseError(`Failed to parse PDF: ${error.message}`);
    }
  }
}

export const documentParserService = new DocumentParserService();