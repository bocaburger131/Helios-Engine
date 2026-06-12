// Quick debug for imports
import PDFParserService from './src/services/pdfParserService.js';
import riskAnalysisService from './src/services/riskAnalysisService.js';

console.log('=== IMPORT DEBUG ===');
console.log('PDFParserService type:', typeof PDFParserService);
console.log('PDFParserService is:', PDFParserService);
console.log('riskAnalysisService type:', typeof riskAnalysisService);
console.log('riskAnalysisService keys:', Object.keys(riskAnalysisService || {}));

// Test constructor
try {
  const pdf = new PDFParserService();
  console.log('PDFParserService instantiated successfully');
} catch (e) {
  console.log('PDFParserService error:', e.message);
}

// Test service methods
try {
  const result = riskAnalysisService.calculateNSFCount([]);
  console.log('calculateNSFCount result:', result);
} catch (e) {
  console.log('calculateNSFCount error:', e.message);
}
