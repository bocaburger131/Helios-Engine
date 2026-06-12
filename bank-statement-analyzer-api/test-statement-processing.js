import { StatementController } from './src/controllers/statement.controller.js';

async function testStatementProcessing() {
  const controller = new StatementController();

  try {
    // Test with null filePath (Zoho scenario)
    await controller.processStatementAsync('test-statement-id', null, null);
    console.log('Statement processing completed successfully');
  } catch (error) {
    console.error('Error processing statement:', error.message);
  }
}

testStatementProcessing();