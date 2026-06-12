// Quick test verification script
import { execSync } from 'child_process';

console.log('🧪 Testing PDFParserService constructor fix...');

try {
  // Try to import and instantiate PDFParserService
  const { default: PDFParserService } = await import('./src/services/pdfParserService.js');
  const service = new PDFParserService();
  console.log('✅ PDFParserService constructor works correctly');
  
  // Try to import the statement controller
  console.log('🔄 Testing StatementController import...');
  const { default: StatementController } = await import('./src/controllers/statementController.js');
  console.log('✅ StatementController imports without errors');
  
  console.log('\n🎉 ALL CONSTRUCTOR ISSUES RESOLVED!');
  console.log('✅ PDFParserService can be instantiated');
  console.log('✅ StatementController imports successfully');
  console.log('✅ Ready for integration tests');
  
} catch (error) {
  console.error('❌ Constructor issue still exists:', error.message);
  console.error(error.stack);
}
