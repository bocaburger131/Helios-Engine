import { promises as fs } from 'fs';
import path from 'path';

console.log(' Cleaning up duplicate model files...\n');

// Define which files to keep (the canonical ones)
const modelsToKeep = {
  'User': 'src/models/User.js',
  'Statement': 'src/models/Statement.js',
  'Transaction': 'src/models/Transaction.js',
  'Merchant': 'src/models/Merchant.js',
  'Analysis': 'src/models/Analysis.js',
  'Audit': 'src/models/audit.js'
};

// Files to delete
const filesToDelete = [
  'src/models/user.model.js',
  'src/models/statement.model.js',
  'src/models/transaction.model.js',
  'src/models/user/user.model.js',
  'src/models/statement/statement.model.js',
  'src/models/statement/statement.model.test.js',
  'src/models/statement/3. src/models/User.model.js',
  'src/models/transaction/transaction.model.js',
  'src/models/transaction/scripts/final-cleanup.js',
  'src/models/src/models/Statement.model.js'
];

async function cleanup() {
  console.log('Files to remove:');
  for (const file of filesToDelete) {
    try {
      await fs.access(file);
      console.log(`   ${file}`);
      await fs.unlink(file);
    } catch (error) {
      console.log(`    ${file} (already gone)`);
    }
  }

  console.log('\n Cleanup complete!');
  console.log('\nCanonical model files:');
  for (const [model, file] of Object.entries(modelsToKeep)) {
    try {
      await fs.access(file);
      console.log(`   ${model}  ${file}`);
    } catch {
      console.log(`    ${model}  ${file} (missing)`);
    }
  }
}

cleanup();
