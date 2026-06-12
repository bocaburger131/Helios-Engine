/**
 * Mongoose Model Refactoring Script
 * 
 * Ensures all model files follow the correct pattern:
 * 1. import mongoose from 'mongoose'; as absolute first line
 * 2. Uses idempotent export pattern to prevent OverwriteModelError
 */

import fs from 'fs/promises';
import path from 'path';

console.log('🔧 Mongoose Model Refactoring Script');
console.log('=' * 50);

const modelFiles = [
  'src/models/Alert.js',
  'src/models/Analysis.js', 
  'src/models/audit.js',
  'src/models/learningModel.js',
  'src/models/Merchant.js',
  'src/models/MerchantCache.js',
  'src/models/Statement.js',
  'src/models/statementModel.js',
  'src/models/Transaction.js',
  'src/models/TransactionCategory.js',
  'src/models/transactionModel.js',
  'src/models/UsageTracker.js',
  'src/models/User.js',
  'src/models/transaction/transaction.model.js'
];

/**
 * Check if file starts with correct mongoose import
 */
function hasCorrectMongooseImport(content) {
  const lines = content.split('\n');
  // Find the first non-comment, non-empty line
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('//') && !trimmed.startsWith('/*')) {
      return trimmed === "import mongoose from 'mongoose';";
    }
  }
  return false;
}

/**
 * Check if file uses idempotent export pattern
 */
function hasIdempotentExport(content, modelName) {
  const patterns = [
    `const ${modelName} = mongoose.models.${modelName} || mongoose.model('${modelName}',`,
    `mongoose.models.${modelName} || mongoose.model('${modelName}',`
  ];
  return patterns.some(pattern => content.includes(pattern));
}

/**
 * Fix mongoose import - ensure it's the absolute first line
 */
function fixMongooseImport(content) {
  const lines = content.split('\n');
  const mongooseImport = "import mongoose from 'mongoose';";
  
  // Remove any existing mongoose imports
  const filteredLines = lines.filter(line => {
    const trimmed = line.trim();
    return !(trimmed.startsWith('import mongoose') && trimmed.includes('mongoose'));
  });
  
  // Add mongoose import as first line
  return [mongooseImport, ...filteredLines].join('\n');
}

/**
 * Extract model name from file path
 */
function getModelNameFromPath(filePath) {
  const fileName = path.basename(filePath, '.js');
  
  // Handle special cases
  const nameMap = {
    'statementModel': 'Statement',
    'transactionModel': 'Transaction', 
    'transaction.model': 'Transaction',
    'audit': 'Audit',
    'learningModel': 'CategoryPattern' // This file exports multiple models
  };
  
  if (nameMap[fileName]) {
    return nameMap[fileName];
  }
  
  // Capitalize first letter for standard files
  return fileName.charAt(0).toUpperCase() + fileName.slice(1);
}

/**
 * Fix export pattern to use idempotent pattern
 */
function fixExportPattern(content, modelName, filePath) {
  // Handle special case for learningModel.js which exports multiple models
  if (filePath.includes('learningModel.js')) {
    // This file exports CategoryPattern and UserPreference - already handled correctly
    return content;
  }
  
  // Standard single model export
  const oldPatterns = [
    new RegExp(`export default mongoose\\.model\\('${modelName}'[^;]+;`, 'g'),
    new RegExp(`const ${modelName} = mongoose\\.model\\('${modelName}'[^;]+;`, 'g'),
    new RegExp(`mongoose\\.model\\('${modelName}'[^;]+;`, 'g')
  ];
  
  const newPattern = `const ${modelName} = mongoose.models.${modelName} || mongoose.model('${modelName}', ${modelName.toLowerCase()}Schema);`;
  
  let updatedContent = content;
  
  // Replace old patterns
  for (const pattern of oldPatterns) {
    updatedContent = updatedContent.replace(pattern, newPattern);
  }
  
  // Ensure we have the export statement
  if (!updatedContent.includes(`export default ${modelName};`)) {
    updatedContent += `\nexport default ${modelName};\n`;
  }
  
  return updatedContent;
}

/**
 * Process a single model file
 */
async function processModelFile(filePath) {
  try {
    console.log(`🔍 Processing ${filePath}...`);
    
    const fullPath = path.resolve(filePath);
    const content = await fs.readFile(fullPath, 'utf-8');
    const modelName = getModelNameFromPath(filePath);
    
    let updatedContent = content;
    let hasChanges = false;
    
    // Check and fix mongoose import
    if (!hasCorrectMongooseImport(content)) {
      console.log(`   🔧 Fixing mongoose import in ${filePath}`);
      updatedContent = fixMongooseImport(updatedContent);
      hasChanges = true;
    } else {
      console.log(`   ✅ Correct mongoose import in ${filePath}`);
    }
    
    // Check and fix export pattern (skip for learningModel.js)
    if (!filePath.includes('learningModel.js')) {
      if (!hasIdempotentExport(content, modelName)) {
        console.log(`   🔧 Fixing export pattern for ${modelName} in ${filePath}`);
        updatedContent = fixExportPattern(updatedContent, modelName, filePath);
        hasChanges = true;
      } else {
        console.log(`   ✅ Correct export pattern for ${modelName} in ${filePath}`);
      }
    }
    
    // Write back if changes were made
    if (hasChanges) {
      await fs.writeFile(fullPath, updatedContent, 'utf-8');
      console.log(`   💾 Updated ${filePath}`);
    } else {
      console.log(`   ⭐ No changes needed for ${filePath}`);
    }
    
    return { filePath, modelName, hasChanges, status: 'success' };
    
  } catch (error) {
    console.error(`   ❌ Error processing ${filePath}:`, error.message);
    return { filePath, error: error.message, status: 'error' };
  }
}

/**
 * Main refactoring process
 */
async function refactorModels() {
  console.log('\n📋 Starting model refactoring...');
  
  const results = [];
  
  for (const filePath of modelFiles) {
    const result = await processModelFile(filePath);
    results.push(result);
  }
  
  console.log('\n📊 Refactoring Summary:');
  console.log('========================');
  
  const successful = results.filter(r => r.status === 'success');
  const errors = results.filter(r => r.status === 'error');
  const changed = successful.filter(r => r.hasChanges);
  
  console.log(`✅ Successfully processed: ${successful.length}/${results.length} files`);
  console.log(`🔧 Files modified: ${changed.length}`);
  console.log(`❌ Errors: ${errors.length}`);
  
  if (changed.length > 0) {
    console.log('\n🔧 Modified files:');
    changed.forEach(r => console.log(`   • ${r.filePath} (${r.modelName})`));
  }
  
  if (errors.length > 0) {
    console.log('\n❌ Files with errors:');
    errors.forEach(r => console.log(`   • ${r.filePath}: ${r.error}`));
  }
  
  console.log('\n🎯 Refactoring pattern applied:');
  console.log('1. ✅ import mongoose from \'mongoose\'; as first line');
  console.log('2. ✅ const ModelName = mongoose.models.ModelName || mongoose.model(\'ModelName\', schema);');
  console.log('3. ✅ export default ModelName;');
  
  return results;
}

// Run the refactoring
refactorModels()
  .then((results) => {
    console.log('\n🎉 Model refactoring complete!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Refactoring failed:', error);
    process.exit(1);
  });
