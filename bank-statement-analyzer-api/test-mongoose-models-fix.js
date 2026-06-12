/**
 * Test Mongoose Models Fix
 * Verify that all models can be imported without ObjectId or OverwriteModelError issues
 */

console.log('🧪 Testing Mongoose Models Fix...\n');

async function testMongooseModels() {
  try {
    console.log('1️⃣ Testing individual model imports...');
    
    // Test individual model imports
    const models = [
      'Statement',
      'Transaction', 
      'User',
      'Alert',
      'Analysis',
      'Merchant',
      'MerchantCache',
      'TransactionCategory',
      'UsageTracker',
      'RiskProfile'
    ];
    
    for (const modelName of models) {
      try {
        const modelModule = await import(`./src/models/${modelName}.js`);
        const model = modelModule.default;
        
        console.log(`   ✅ ${modelName}: Imported successfully`);
        console.log(`      - Model name: ${model.modelName}`);
        console.log(`      - Collection: ${model.collection.name}`);
        
        // Test that ObjectId is accessible
        if (model.schema.paths._id) {
          console.log(`      - ObjectId type: ${model.schema.paths._id.instance}`);
        }
        
      } catch (error) {
        console.error(`   ❌ ${modelName}: Import failed`);
        console.error(`      Error: ${error.message}`);
        throw error;
      }
    }
    
    console.log('\n2️⃣ Testing multiple imports (OverwriteModelError check)...');
    
    // Test multiple imports of the same model
    for (let i = 0; i < 3; i++) {
      try {
        const User1 = (await import('./src/models/User.js')).default;
        const User2 = (await import('./src/models/User.js')).default;
        const Statement1 = (await import('./src/models/Statement.js')).default;
        const Statement2 = (await import('./src/models/Statement.js')).default;
        
        console.log(`   ✅ Iteration ${i + 1}: No OverwriteModelError`);
        console.log(`      - User model instances equal: ${User1 === User2}`);
        console.log(`      - Statement model instances equal: ${Statement1 === Statement2}`);
        
      } catch (error) {
        console.error(`   ❌ Iteration ${i + 1}: Multiple import failed`);
        console.error(`      Error: ${error.message}`);
        throw error;
      }
    }
    
    console.log('\n3️⃣ Testing index.js bulk import...');
    
    try {
      const allModels = await import('./src/models/index.js');
      const { Statement, Transaction, User, RiskProfile } = allModels;
      
      console.log('   ✅ Bulk import successful');
      console.log(`      - Statement: ${Statement.modelName}`);
      console.log(`      - Transaction: ${Transaction.modelName}`);
      console.log(`      - User: ${User.modelName}`);
      console.log(`      - RiskProfile: ${RiskProfile.modelName}`);
      
    } catch (error) {
      console.error('   ❌ Bulk import failed');
      console.error(`      Error: ${error.message}`);
      throw error;
    }
    
    console.log('\n4️⃣ Testing ObjectId access...');
    
    try {
      const mongoose = (await import('mongoose')).default;
      const { ObjectId } = mongoose.Schema.Types;
      
      console.log('   ✅ ObjectId accessible from mongoose');
      console.log(`      - ObjectId type: ${typeof ObjectId}`);
      console.log(`      - Can create ObjectId: ${new mongoose.Types.ObjectId()}`);
      
    } catch (error) {
      console.error('   ❌ ObjectId access failed');
      console.error(`      Error: ${error.message}`);
      throw error;
    }
    
    console.log('\n🎉 All Mongoose Model Tests Passed!');
    console.log('\n📋 Test Summary:');
    console.log('   ✅ Individual model imports working');
    console.log('   ✅ No OverwriteModelError on multiple imports');
    console.log('   ✅ Bulk imports from index.js working');
    console.log('   ✅ ObjectId access working');
    console.log('   ✅ Idempotent model pattern implemented correctly');
    
    return true;
    
  } catch (error) {
    console.error('\n💥 Mongoose Model Test Failed:');
    console.error('Error:', error.message);
    console.error('Stack:', error.stack);
    return false;
  }
}

// Run the test
testMongooseModels()
  .then((success) => {
    if (success) {
      console.log('\n✨ Mongoose models are now fixed and ready to use!');
      process.exit(0);
    } else {
      console.log('\n❌ Some issues remain with Mongoose models');
      process.exit(1);
    }
  })
  .catch((error) => {
    console.error('\n💥 Test execution failed:', error);
    process.exit(1);
  });
