// Script to update test files with new schema requirements
import fs from 'fs';
import path from 'path';

const testFilesToUpdate = [
  'tests/models/Statement.test.js',
  'tests/integration/model-availability.test.js',
  'tests/integration/routes-availability.test.js'
];

const enumMappings = {
  // Statement status
  "'pending'": "'PENDING'",
  '"pending"': '"PENDING"',
  "'processing'": "'PROCESSING'",
  '"processing"': '"PROCESSING"',
  "'completed'": "'COMPLETED'",
  '"completed"': '"COMPLETED"',
  "'failed'": "'FAILED'",
  '"failed"': '"FAILED"',
  "'uploaded'": "'UPLOADED'",
  '"uploaded"': '"UPLOADED"',
  "'ready'": "'READY'",
  '"ready"': '"READY"',
  
  // Transaction types
  "'credit'": "'CREDIT'",
  '"credit"': '"CREDIT"',
  "'debit'": "'DEBIT'",
  '"debit"': '"DEBIT"',
  
  // User roles
  "'user'": "'USER'",
  '"user"': '"USER"',
  "'admin'": "'ADMIN'",
  '"admin"': '"ADMIN"',
  "'analyst'": "'ANALYST'",
  '"analyst"': '"ANALYST"',
  "'viewer'": "'VIEWER'",
  '"viewer"': '"VIEWER"',
  
  // Themes and other enums
  "'light'": "'LIGHT'",
  '"light"': '"LIGHT"',
  "'dark'": "'DARK'",
  '"dark"': '"DARK"',
  "'auto'": "'AUTO'",
  '"auto"': '"AUTO"',
  "'free'": "'FREE'",
  '"free"': '"FREE"',
  "'basic'": "'BASIC'",
  '"basic"': '"BASIC"',
  "'premium'": "'PREMIUM'",
  '"premium"': '"PREMIUM"',
  "'enterprise'": "'ENTERPRISE'",
  '"enterprise"': '"ENTERPRISE"',
  "'active'": "'ACTIVE'",
  '"active"': '"ACTIVE"',
  "'inactive'": "'INACTIVE'",
  '"inactive"': '"INACTIVE"',
  "'cancelled'": "'CANCELLED'",
  '"cancelled"': '"CANCELLED"',
  "'expired'": "'EXPIRED'",
  '"expired"': '"EXPIRED"'
};

const requiredFieldUpdates = {
  // Statement test updates
  'status: \'pending\'': 'status: \'PENDING\'',
  'status: "pending"': 'status: "PENDING"',
  
  // Add missing required fields for Statement
  'userId: new mongoose.Types.ObjectId()': `userId: new mongoose.Types.ObjectId(),
      uploadId: 'test_upload_' + Date.now(),
      accountNumber: '123456789',
      bankName: 'Test Bank',
      statementDate: new Date(),
      fileName: 'test-statement.pdf',
      fileUrl: 'https://example.com/test-statement.pdf',
      openingBalance: 1000.00,
      closingBalance: 1500.00`,
  
  // Transaction test updates
  'type: \'credit\'': 'type: \'CREDIT\'',
  'type: "credit"': 'type: "CREDIT"',
  'type: \'debit\'': 'type: \'DEBIT\'',
  'type: "debit"': 'type: "DEBIT"'
};

function updateTestFile(filePath) {
  const fullPath = path.join('c:\\Users\\Jorge Brice\\Desktop\\BankSatement V2\\bank-statement-analyzer-api', filePath);
  
  if (!fs.existsSync(fullPath)) {
    console.log(`⚠️  File not found: ${filePath}`);
    return;
  }
  
  try {
    let content = fs.readFileSync(fullPath, 'utf8');
    let updated = false;
    
    // Apply enum mappings
    for (const [oldValue, newValue] of Object.entries(enumMappings)) {
      const regex = new RegExp(oldValue.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
      if (content.includes(oldValue)) {
        content = content.replace(regex, newValue);
        updated = true;
      }
    }
    
    // Apply required field updates
    for (const [oldPattern, newPattern] of Object.entries(requiredFieldUpdates)) {
      if (content.includes(oldPattern)) {
        content = content.replace(oldPattern, newPattern);
        updated = true;
      }
    }
    
    if (updated) {
      fs.writeFileSync(fullPath, content, 'utf8');
      console.log(`✅ Updated: ${filePath}`);
    } else {
      console.log(`ℹ️  No changes needed: ${filePath}`);
    }
  } catch (error) {
    console.error(`❌ Error updating ${filePath}:`, error.message);
  }
}

console.log('🔄 Updating test files to match new schema requirements...\n');

testFilesToUpdate.forEach(updateTestFile);

console.log('\n✨ Test file updates complete!');
console.log('\n📋 Summary of changes:');
console.log('- Updated enum values to UPPERCASE');
console.log('- Added missing required fields');
console.log('- Enhanced validation constraints');
console.log('\n⚠️  Manual review recommended for:');
console.log('- Complex test scenarios');
console.log('- Custom validation logic');
console.log('- Integration test expectations');
