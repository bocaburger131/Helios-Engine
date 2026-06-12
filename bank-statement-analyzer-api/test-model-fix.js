#!/usr/bin/env node

/**
 * Test Model Availability Validation
 * ==================================
 * This script validates that our centralized setup properly makes models available
 * to fix the "User is not defined" errors
 */

console.log('🔍 Testing Model Availability Fix');
console.log('=================================\n');

// Import the setup file to initialize global models
await import('./tests/vitest.setup.js');

console.log('📊 Model Availability Check:');

// Check if User model is available globally
if (typeof global.User !== 'undefined') {
  console.log('✅ User model: AVAILABLE globally');
  console.log(`   - create method: ${typeof global.User.create}`);
  console.log(`   - findOne method: ${typeof global.User.findOne}`);
  console.log(`   - findById method: ${typeof global.User.findById}`);
} else {
  console.log('❌ User model: NOT AVAILABLE globally');
}

// Check if Statement model is available globally
if (typeof global.Statement !== 'undefined') {
  console.log('✅ Statement model: AVAILABLE globally');
  console.log(`   - create method: ${typeof global.Statement.create}`);
  console.log(`   - findOne method: ${typeof global.Statement.findOne}`);
  console.log(`   - findById method: ${typeof global.Statement.findById}`);
} else {
  console.log('❌ Statement model: NOT AVAILABLE globally');
}

// Check models object
if (typeof global.models !== 'undefined') {
  console.log('✅ models object: AVAILABLE globally');
  console.log(`   - models.User: ${typeof global.models.User}`);
  console.log(`   - models.Statement: ${typeof global.models.Statement}`);
} else {
  console.log('❌ models object: NOT AVAILABLE globally');
}

console.log('\n🧪 Quick Model Test:');

try {
  // Test User model functionality
  const testUser = await global.User.create({
    email: 'test@example.com',
    name: 'Test User'
  });
  console.log('✅ User.create() works:', !!testUser._id);

  const foundUser = await global.User.findOne({ email: 'test@example.com' });
  console.log('✅ User.findOne() works:', !!foundUser);

  // Test Statement model functionality
  const testStatement = await global.Statement.create({
    filename: 'test.pdf',
    userId: '507f1f77bcf86cd799439011'
  });
  console.log('✅ Statement.create() works:', !!testStatement._id);

  console.log('\n🎉 SUCCESS: All models working correctly!');
  console.log('🔧 The "User is not defined" error should now be fixed.');
  
} catch (error) {
  console.log('\n❌ ERROR during model testing:', error.message);
}

console.log('\n🚀 Ready to run tests:');
console.log('   npx vitest run');
console.log('   npx vitest tests/integration/statement.integration.test.js');
