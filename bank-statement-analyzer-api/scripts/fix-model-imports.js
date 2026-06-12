import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const modelMappings = {
  '../models/statement/Statement.js': '../models/Statement.js',
  '../models/user/User.js': '../models/User.js',
  '../models/transaction/Transaction.js': '../models/Transaction.js',
  '../../src/models/statement/statement.model.js': '../../src/models/Statement.js',
  '../../src/models/user/user.model.js': '../../src/models/User.js',
  '../../src/models/transaction/transaction.model.js': '../../src/models/Transaction.js'
};

async function fixImports() {
  const testFiles = [
    'src/repositories/statement.repository.js',
    'src/repositories/user.repository.js',
    'tests/models/Statement.test.js',
    'tests/models/Transaction.test.js'
  ];

  for (const file of testFiles) {
    const filePath = path.join(rootDir, file);
    try {
      let content = await fs.readFile(filePath, 'utf8');
      let modified = false;

      for (const [oldPath, newPath] of Object.entries(modelMappings)) {
        if (content.includes(oldPath)) {
          content = content.replace(new RegExp(oldPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), newPath);
          modified = true;
        }
      }

      if (modified) {
        await fs.writeFile(filePath, content);
        console.log(`✅ Fixed imports in ${file}`);
      }
    } catch (error) {
      console.log(`⚠️  Skipping ${file}: ${error.message}`);
    }
  }
}

fixImports().catch(console.error);