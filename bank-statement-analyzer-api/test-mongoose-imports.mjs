/**
 * Simple test to identify Mongoose ObjectId errors
 */

console.log('🔍 Testing Mongoose ObjectId Import Issues...');

try {
  // Import mongoose first
  import('mongoose').then(async (mongoose) => {
    console.log('✅ Mongoose imported successfully');
    console.log('✅ ObjectId available:', typeof mongoose.default.Schema.Types.ObjectId);
    
    // Test each model import
    const modelTests = [
      './src/models/Alert.js',
      './src/models/Analysis.js', 
      './src/models/audit.js',
      './src/models/learningModel.js',
      './src/models/Merchant.js',
      './src/models/MerchantCache.js',
      './src/models/Statement.js',
      './src/models/statementModel.js',
      './src/models/Transaction.js',
      './src/models/TransactionCategory.js',
      './src/models/transactionModel.js',
      './src/models/UsageTracker.js',
      './src/models/User.js',
      './src/models/transaction/transaction.model.js'
    ];

    for (const modelPath of modelTests) {
      try {
        console.log(`📋 Testing ${modelPath}...`);
        const model = await import(modelPath);
        console.log(`   ✅ ${modelPath} imported successfully`);
      } catch (error) {
        console.error(`   ❌ ${modelPath} failed:`, error.message);
        if (error.message.includes('ObjectId')) {
          console.error(`   🔧 ObjectId error detected in ${modelPath}`);
        }
      }
    }
    
    console.log('\n🎉 Model import test complete!');
    process.exit(0);
  });
  
} catch (error) {
  console.error('❌ Failed to import mongoose:', error);
  process.exit(1);
}
