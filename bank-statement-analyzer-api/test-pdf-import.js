import PDFParserService from './src/services/pdfParserService.js';

console.log('=== PDF PARSER SERVICE TEST ===');
console.log('PDFParserService type:', typeof PDFParserService);
console.log('PDFParserService:', PDFParserService);

try {
  const pdfService = new PDFParserService();
  console.log('✅ Successfully created PDFParserService instance');
  console.log('Instance type:', typeof pdfService);
  console.log('Instance methods:', Object.getOwnPropertyNames(Object.getPrototypeOf(pdfService)));
} catch (error) {
  console.error('❌ Failed to create PDFParserService instance:', error);
}
