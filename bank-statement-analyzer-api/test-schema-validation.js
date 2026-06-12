// Test script to validate all schema fixes
import mongoose from 'mongoose';
import Statement from './src/models/Statement.js';
import Transaction from './src/models/Transaction.js';
import User from './src/models/User.js';

console.log('🔍 Testing Schema Validation Fixes...\n');

// Test data that should PASS validation
const validUserData = {
  name: 'John Doe',
  email: 'john.doe@example.com',
  password: 'password123',
  role: 'USER', // Uppercase as required
  profile: {
    firstName: 'John',
    lastName: 'Doe',
    phone: '+1234567890'
  },
  preferences: {
    theme: 'LIGHT' // Uppercase as required
  },
  subscription: {
    plan: 'FREE', // Uppercase as required
    status: 'ACTIVE' // Uppercase as required
  }
};

const validStatementData = {
  userId: new mongoose.Types.ObjectId(),
  uploadId: 'test_upload_123',
  accountNumber: '123456789',
  bankName: 'Test Bank',
  statementDate: new Date(),
  fileName: 'test-statement.pdf',
  fileUrl: 'https://example.com/test-statement.pdf',
  openingBalance: 1000.00,
  closingBalance: 1500.00,
  status: 'PENDING', // Uppercase as required
  metadata: {
    originalName: 'statement.pdf',
    size: 1024,
    mimetype: 'application/pdf',
    pages: 5
  }
};

const validTransactionData = {
  statementId: new mongoose.Types.ObjectId(),
  userId: new mongoose.Types.ObjectId(),
  date: new Date(),
  description: 'Test Transaction',
  amount: 100.00,
  type: 'CREDIT', // Uppercase as required
  category: 'INCOME', // Uppercase as required
  subcategory: 'SALARY' // Uppercase as required
};

// Test data that should FAIL validation
const invalidUserData = {
  name: 'John Doe',
  email: 'invalid-email', // Invalid email format
  password: '123', // Too short
  role: 'invalid_role', // Invalid enum value
  preferences: {
    theme: 'invalid_theme' // Invalid enum value
  }
};

const invalidStatementData = {
  // Missing required fields
  userId: new mongoose.Types.ObjectId(),
  // Missing uploadId, accountNumber, bankName, etc.
  status: 'invalid_status', // Invalid enum value
  metadata: {
    size: -100 // Negative file size
  }
};

const invalidTransactionData = {
  statementId: new mongoose.Types.ObjectId(),
  userId: new mongoose.Types.ObjectId(),
  // Missing required date
  description: '', // Empty description
  amount: 'not_a_number', // Invalid amount
  type: 'invalid_type', // Invalid enum value
  confidence: 2 // Out of range (should be 0-1)
};

async function testSchemaValidation() {
  try {
    console.log('✅ Testing VALID data:\n');
    
    // Test valid User
    const user = new User(validUserData);
    const userValidation = user.validateSync();
    if (!userValidation) {
      console.log('✓ User schema: Valid data passed validation');
    } else {
      console.log('✗ User schema: Unexpected validation error:', userValidation.message);
    }
    
    // Test valid Statement
    const statement = new Statement(validStatementData);
    const statementValidation = statement.validateSync();
    if (!statementValidation) {
      console.log('✓ Statement schema: Valid data passed validation');
    } else {
      console.log('✗ Statement schema: Unexpected validation error:', statementValidation.message);
    }
    
    // Test valid Transaction
    const transaction = new Transaction(validTransactionData);
    const transactionValidation = transaction.validateSync();
    if (!transactionValidation) {
      console.log('✓ Transaction schema: Valid data passed validation');
    } else {
      console.log('✗ Transaction schema: Unexpected validation error:', transactionValidation.message);
    }
    
    console.log('\n❌ Testing INVALID data:\n');
    
    // Test invalid User
    const invalidUser = new User(invalidUserData);
    const invalidUserValidation = invalidUser.validateSync();
    if (invalidUserValidation) {
      console.log('✓ User schema: Invalid data correctly rejected');
      console.log('  Errors:', Object.keys(invalidUserValidation.errors));
    } else {
      console.log('✗ User schema: Invalid data incorrectly passed validation');
    }
    
    // Test invalid Statement
    const invalidStatement = new Statement(invalidStatementData);
    const invalidStatementValidation = invalidStatement.validateSync();
    if (invalidStatementValidation) {
      console.log('✓ Statement schema: Invalid data correctly rejected');
      console.log('  Errors:', Object.keys(invalidStatementValidation.errors));
    } else {
      console.log('✗ Statement schema: Invalid data incorrectly passed validation');
    }
    
    // Test invalid Transaction
    const invalidTransaction = new Transaction(invalidTransactionData);
    const invalidTransactionValidation = invalidTransaction.validateSync();
    if (invalidTransactionValidation) {
      console.log('✓ Transaction schema: Invalid data correctly rejected');
      console.log('  Errors:', Object.keys(invalidTransactionValidation.errors));
    } else {
      console.log('✗ Transaction schema: Invalid data incorrectly passed validation');
    }
    
    console.log('\n🎯 Schema Validation Test Summary:');
    console.log('- Enhanced required field validation');
    console.log('- Standardized enum values to UPPERCASE');
    console.log('- Added comprehensive error messages');
    console.log('- Improved data type constraints');
    console.log('- Added length and range validations');
    
  } catch (error) {
    console.error('❌ Test error:', error.message);
  }
}

// Run the test
testSchemaValidation();
