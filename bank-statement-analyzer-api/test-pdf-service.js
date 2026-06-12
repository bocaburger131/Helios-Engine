// Test PDFParserService import
import PDFParserService from './src/services/pdfParserService.js';

console.log('=== PDF PARSER SERVICE TEST ===');
console.log('PDFParserService:', PDFParserService);
console.log('Type:', typeof PDFParserService);

try {
  const pdfParserService = new PDFParserService();
  console.log('✓ Successfully created instance:', !!pdfParserService);
  console.log('Instance type:', typeof pdfParserService);
} catch (error) {
  console.log('❌ Error creating instance:', error.message);
}
