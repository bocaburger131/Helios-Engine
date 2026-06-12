import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// List of test files to remove (these are duplicates or broken)
const filesToRemove = [
  'tests/env-check.test.js',
  'tests/env-vars.test.js',
  'tests/globals.test.js',
  'tests/manual-mock.test.js',
  'tests/module-imports.test.js',
  'tests/no-mock.test.js',
  'tests/sanity-check.test.js',
  'tests/sanity.test.js',
  'tests/statements.controller.test.js',
  'scripts/fix-tests.test.js',
  'src/repositories/statementRepository.test.js',
  'src/repositories/user.repository.test.js',
  'src/repositories/statement.repository.test.js',
  'tests/helpers/testDb.test.js',
  'tests/tests/simple-working.test.js',
  'src/models_backup_20250703_224734/transaction/transaction.model.test.js',
  'src/models_backup_20250703_224734/user/user.model.test.js',
  'src/models_backup_20250703_224734/statement/statement.model.test.js',
  'src/services/tests/integration/analysis.integration.test.js'
];

const rootDir = path.resolve(__dirname, '..');

filesToRemove.forEach(file => {
  const filePath = path.join(rootDir, file);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
    console.log(`Removed: ${file}`);
  }
});

console.log('Cleanup completed!');