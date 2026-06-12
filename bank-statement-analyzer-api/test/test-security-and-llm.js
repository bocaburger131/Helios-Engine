import fs from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
import { SecurityMiddleware } from '../src/middleware/securitySimple.js';
import llmCategorization from '../src/services/llmCategorizationService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Test transactions
const testTransactions = [
  { date: '2024-01-01', description: 'WALMART SUPERCENTER #1234', amount: -125.43 },
  { date: '2024-01-02', description: 'STARBUCKS COFFEE #5678', amount: -5.95 },
  { date: '2024-01-03', description: 'UBER TRIP HELP.UBER.COM', amount: -18.50 },
  { date: '2024-01-04', description: 'COMCAST CABLE PAYMENT', amount: -99.99 },
  { date: '2024-01-05', description: 'WALGREENS PHARMACY #9012', amount: -45.28 },
  { date: '2024-01-06', description: 'NSF FEE - INSUFFICIENT FUNDS', amount: -35.00 },
  { date: '2024-01-07', description: 'Direct Deposit - ACME CORP PAYROLL', amount: 2500.00 },
  { date: '2024-01-08', description: 'Transfer to Savings Account 123456789', amount: -500.00 },
  { date: '2024-01-09', description: 'NETFLIX.COM MONTHLY', amount: -15.99 },
  { date: '2024-01-10', description: 'SHELL GAS STATION #3456', amount: -65.00 }
];

// Security tests
async function testSecurityFeatures() {
  console.log('\n🔐 Testing Security Features\n');
  
  // Test 1: Encryption/Decryption
  console.log('1️⃣ Testing Encryption/Decryption...');
  try {
    const testData = Buffer.from('Sensitive bank data with account 1234567890');
    const userKey = 'user-session-key-123';
    
    const encrypted = await SecurityMiddleware.encryptBuffer(testData, userKey);
    console.log('✅ Data encrypted successfully');
    console.log(`   Encrypted size: ${encrypted.encrypted.length} bytes`);
    
    const decrypted = await SecurityMiddleware.decryptBuffer(encrypted, userKey);
    console.log('✅ Data decrypted successfully');
    console.log(`   Decrypted matches original: ${testData.toString() === decrypted.toString()}`);
  } catch (error) {
    console.error('❌ Encryption test failed:', error.message);
  }
  
  // Test 2: Data Sanitization
  console.log('\n2️⃣ Testing Data Sanitization...');
  const sensitiveTransactions = [
    { description: 'Payment to account 1234567890123456', amount: -100 },
    { description: 'SSN verification 123-45-6789', amount: 0 },
    { description: 'Call 555-123-4567 for info', amount: -50 },
    { description: 'Email receipt to john.doe@email.com', amount: -25 }
  ];
  
  sensitiveTransactions.forEach(trans => {
    const sanitized = SecurityMiddleware.sanitizeTransaction(trans);
    console.log(`✅ Original: "${trans.description}"`);
    console.log(`   Sanitized: "${sanitized.description}"`);
  });
  
  // Test 3: File Validation
  console.log('\n3️⃣ Testing File Validation...');
  const testFiles = [
    { 
      originalname: 'statement.pdf',
      mimetype: 'application/pdf',
      size: 500000,
      buffer: Buffer.from('%PDF-1.4 legitimate content')
    },
    {
      originalname: 'malware.exe',
      mimetype: 'application/pdf',
      size: 100000,
      buffer: Buffer.from('MZ executable file content')
    },
    {
      originalname: 'huge-file.pdf',
      mimetype: 'application/pdf',
      size: 15 * 1024 * 1024,
      buffer: Buffer.from('%PDF-1.4')
    }
  ];
  
  for (const file of testFiles) {
    const validation = await SecurityMiddleware.validateFileUpload(file);
    console.log(`\n📄 File: ${file.originalname}`);
    console.log(`   Valid: ${validation.isValid ? '✅' : '❌'}`);
    if (validation.errors.length > 0) {
      console.log(`   Errors: ${validation.errors.join(', ')}`);
    }
    if (validation.warnings.length > 0) {
      console.log(`   Warnings: ${validation.warnings.join(', ')}`);
    }
  }
  
  // Test 4: Token Generation
  console.log('\n4️⃣ Testing Token Generation...');
  const token = SecurityMiddleware.generateSecureToken();
  console.log(`✅ Secure token generated: ${token.substring(0, 20)}...`);
  
  const timeToken = SecurityMiddleware.generateTimeBasedToken(5);
  console.log(`✅ Time-based token generated (expires in 5 min)`);
  
  const verification = SecurityMiddleware.verifyTimeBasedToken(timeToken.token);
  console.log(`✅ Token verification: ${verification.valid ? 'Valid' : 'Invalid'}`);
}

// LLM Categorization tests
async function testLLMCategorization() {
  console.log('\n\n🤖 Testing LLM Categorization\n');
  
  // Test 1: Initial categorization
  console.log('1️⃣ Testing Initial Categorization...');
  for (const transaction of testTransactions.slice(0, 5)) {
    const result = await llmCategorization.categorizeTransaction(transaction);
    console.log(`\n💳 ${transaction.description}`);
    console.log(`   Category: ${result.category} (${(result.confidence * 100).toFixed(1)}%)`);
    console.log(`   Method: ${result.method}`);
    if (result.alternativeCategories.length > 0) {
      console.log(`   Alternatives: ${result.alternativeCategories.map(a => `${a.category}(${(a.confidence * 100).toFixed(1)}%)`).join(', ')}`);
    }
  }
  
  // Test 2: Learning from feedback
  console.log('\n\n2️⃣ Testing Learning from Feedback...');
  const learningExamples = [
    { transaction: testTransactions[0], correctCategory: 'Groceries' },
    { transaction: testTransactions[1], correctCategory: 'Dining' },
    { transaction: testTransactions[2], correctCategory: 'Transportation' },
    { transaction: testTransactions[3], correctCategory: 'Utilities' },
    { transaction: testTransactions[4], correctCategory: 'Healthcare' }
  ];
  
  for (const example of learningExamples) {
    const learned = await llmCategorization.learnFromTransaction(
      example.transaction,
      example.correctCategory
    );
    console.log(`✅ Learned: ${example.transaction.description.substring(0, 30)}... → ${example.correctCategory}`);
  }
  
  // Test 3: Re-categorize after learning
  console.log('\n\n3️⃣ Testing Categorization After Learning...');
  console.log('(Should show improved confidence)');
  
  for (const transaction of testTransactions.slice(0, 5)) {
    const result = await llmCategorization.categorizeTransaction(transaction);
    console.log(`\n💳 ${transaction.description}`);
    console.log(`   Category: ${result.category} (${(result.confidence * 100).toFixed(1)}%)`);
    console.log(`   Method: ${result.method}`);
  }
  
  // Test 4: Privacy-preserving fingerprints
  console.log('\n\n4️⃣ Testing Privacy Features...');
  const privateData = [
    'WALMART #1234 CARD 5678',
    'WALMART #5678 CARD 1234',
    'WALMART GROCERY ONLINE'
  ];
  
  console.log('Fingerprints for similar merchants:');
  privateData.forEach(desc => {
    const fingerprint = llmCategorization.generateFingerprint(desc);
    console.log(`   "${desc}" → ${fingerprint}`);
  });
  
  // Test 5: Model export
  console.log('\n\n5️⃣ Testing Model Export/Import...');
  const exportedModel = llmCategorization.exportModel();
  console.log('✅ Model exported:');
  console.log(`   Categories: ${Object.keys(exportedModel.categories).length}`);
  console.log(`   Merchants: ${exportedModel.merchantFingerprints.length}`);
  console.log(`   Total Patterns: ${exportedModel.statistics.totalPatterns}`);
  
  // Test 6: Category statistics
  console.log('\n\n6️⃣ Category Distribution:');
  const categoryStats = new Map();
  for (const transaction of testTransactions) {
    const result = await llmCategorization.categorizeTransaction(transaction);
    categoryStats.set(result.category, (categoryStats.get(result.category) || 0) + 1);
  }
  
  for (const [category, count] of categoryStats) {
    console.log(`   ${category}: ${count} transactions`);
  }
}

// Performance test
async function testPerformance() {
  console.log('\n\n⚡ Testing Performance\n');
  
  // Generate 1000 test transactions
  const largeDataset = [];
  for (let i = 0; i < 1000; i++) {
    largeDataset.push({
      date: new Date(2024, 0, (i % 30) + 1).toISOString(),
      description: testTransactions[i % testTransactions.length].description + ` REF${i}`,
      amount: testTransactions[i % testTransactions.length].amount * (1 + (Math.random() - 0.5) * 0.2)
    });
  }
  
  console.log('Processing 1000 transactions...');
  const startTime = Date.now();
  
  let categorized = 0;
  for (const transaction of largeDataset) {
    await llmCategorization.categorizeTransaction(transaction);
    categorized++;
    if (categorized % 100 === 0) {
      console.log(`   Processed: ${categorized}/1000`);
    }
  }
  
  const endTime = Date.now();
  const totalTime = (endTime - startTime) / 1000;
  console.log(`\n✅ Performance Results:`);
  console.log(`   Total time: ${totalTime.toFixed(2)} seconds`);
  console.log(`   Average per transaction: ${(totalTime / 1000 * 1000).toFixed(2)} ms`);
  console.log(`   Transactions per second: ${(1000 / totalTime).toFixed(2)}`);
}

// Main test runner
async function runAllTests() {
  console.log('🏦 Bank Statement Analyzer - Security & LLM Test Suite');
  console.log('=' .repeat(60));
  
  await testSecurityFeatures();
  await testLLMCategorization();
  await testPerformance();
  
  console.log('\n\n✅ All tests completed!');
}

// Run tests
runAllTests().catch(console.error);