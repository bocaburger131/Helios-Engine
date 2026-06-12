#!/usr/bin/env node
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

console.log(' Bank Statement Analyzer API - Environment Setup\n');

// Step 1: Check and create .env file
async function setupEnvironment() {
  console.log(' Step 1: Setting up environment variables...');
  
  const envExample = `
# Server Configuration
NODE_ENV=development
PORT=5000

# Database
MONGODB_URI=mongodb://localhost:27017/bank-analyzer
MONGODB_URI_TEST=mongodb://localhost:27017/bank-analyzer-test

# Authentication
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production

# API Keys
PERPLEXITY_API_KEY=your-perplexity-api-key
OPENAI_API_KEY=your-openai-api-key

# Redis Configuration
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=

# Google Cloud Storage
GCS_PROJECT_ID=your-project-id
GCS_BUCKET_NAME=bank-statements-analyzer
GCS_KEY_FILENAME=./service-account-key.json

# File Upload
MAX_FILE_SIZE=10485760
UPLOAD_DIR=./uploads

# Rate Limiting
RATE_LIMIT_WINDOW=15
RATE_LIMIT_MAX=100

# Logging
LOG_LEVEL=info
`.trim();

  try {
    await fs.access('.env');
    console.log('   .env file exists');
  } catch {
    await fs.writeFile('.env', envExample);
    console.log('   Created .env file (please update with your values)');
  }

  // Create .env.test for testing
  const envTest = `
NODE_ENV=test
PORT=5001
MONGODB_URI_TEST=mongodb://localhost:27017/bank-analyzer-test
JWT_SECRET=test-secret-key
PERPLEXITY_API_KEY=test-api-key
API_KEY=test-api-key
REDIS_HOST=localhost
REDIS_PORT=6379
LOG_LEVEL=error
`.trim();

  try {
    await fs.access('.env.test');
    console.log('   .env.test file exists');
  } catch {
    await fs.writeFile('.env.test', envTest);
    console.log('   Created .env.test file');
  }
}

// Step 2: Clean up duplicate models
async function cleanupModels() {
  console.log('\n Step 2: Cleaning up duplicate model files...');
  
  const duplicates = [
    'src/models/user.model.js',
    'src/models/statement.model.js',
    'src/models/transaction.model.js',
    'src/models/user',
    'src/models/statement',
    'src/models/transaction',
    'src/models/src'
  ];

  for (const dup of duplicates) {
    try {
      const stats = await fs.stat(dup);
      if (stats.isDirectory()) {
        await fs.rm(dup, { recursive: true, force: true });
        console.log(`   Removed directory: ${dup}`);
      } else {
        await fs.unlink(dup);
        console.log(`   Removed file: ${dup}`);
      }
    } catch {
      // File doesn't exist, that's fine
    }
  }

  // Ensure canonical models exist
  const models = ['User', 'Statement', 'Transaction', 'Analysis', 'Merchant'];
  for (const model of models) {
    const modelPath = `src/models/${model}.js`;
    try {
      await fs.access(modelPath);
      console.log(`   ${model}.js exists`);
    } catch {
      console.log(`    ${model}.js missing - creating...`);
      await createModel(model);
    }
  }
}

// Step 3: Fix all imports
async function fixImports() {
  console.log('\n Step 3: Fixing import statements...');
  
  const replacements = [
    [/from ['"](.*)\/transaction\.model\.js['"]/g, "from '$1/Transaction.js'"],
    [/from ['"](.*)\/statement\.model\.js['"]/g, "from '$1/Statement.js'"],
    [/from ['"](.*)\/user\.model\.js['"]/g, "from '$1/User.js'"],
    [/require\(['"](.*)\/transaction\.model\.js['"]\)/g, "require('$1/Transaction.js')"],
    [/require\(['"](.*)\/statement\.model\.js['"]\)/g, "require('$1/Statement.js')"],
    [/require\(['"](.*)\/user\.model\.js['"]\)/g, "require('$1/User.js')"]
  ];

  async function fixFile(filePath) {
    try {
      let content = await fs.readFile(filePath, 'utf8');
      let modified = false;

      for (const [pattern, replacement] of replacements) {
        if (content.match(pattern)) {
          content = content.replace(pattern, replacement);
          modified = true;
        }
      }

      if (modified) {
        await fs.writeFile(filePath, content, 'utf8');
        return true;
      }
    } catch {
      // Ignore errors
    }
    return false;
  }

  async function scanDir(dir) {
    const files = await fs.readdir(dir, { withFileTypes: true });
    let count = 0;

    for (const file of files) {
      const fullPath = path.join(dir, file.name);
      
      if (file.isDirectory() && 
          !file.name.includes('node_modules') && 
          !file.name.includes('.git') &&
          !file.name.includes('models_backup')) {
        count += await scanDir(fullPath);
      } else if (file.name.endsWith('.js')) {
        if (await fixFile(fullPath)) {
          count++;
        }
      }
    }
    return count;
  }

  const fixed = await scanDir('./src');
  console.log(`   Fixed imports in ${fixed} files`);
}

// Step 4: Create required directories
async function createDirectories() {
  console.log('\n Step 4: Creating required directories...');
  
  const dirs = [
    'uploads',
    'logs',
    'temp',
    'src/config',
    'src/controllers',
    'src/middleware',
    'src/models',
    'src/routes',
    'src/services',
    'src/utils'
  ];

  for (const dir of dirs) {
    try {
      await fs.mkdir(dir, { recursive: true });
      console.log(`   ${dir}/`);
    } catch {
      // Already exists
    }
  }
}

// Step 5: Validate core files
async function validateCoreFiles() {
  console.log('\n Step 5: Validating core files...');
  
  const coreFiles = {
    'src/server.js': 'Main server file',
    'src/app.js': 'Express application',
    'src/config/database.js': 'Database configuration',
    'src/middleware/authMiddleware.js': 'Authentication middleware',
    'src/utils/logger.js': 'Logger utility'
  };

  for (const [file, desc] of Object.entries(coreFiles)) {
    try {
      await fs.access(file);
      console.log(`   ${desc} exists`);
    } catch {
      console.log(`    ${desc} missing at ${file}`);
    }
  }
}

// Helper function to create missing models
async function createModel(modelName) {
  const modelTemplates = {
    Analysis: `import mongoose from 'mongoose';

const analysisSchema = new mongoose.Schema({
  statementId: { type: mongoose.Schema.Types.ObjectId, ref: 'Statement', required: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  results: mongoose.Schema.Types.Mixed,
  insights: mongoose.Schema.Types.Mixed,
  createdAt: { type: Date, default: Date.now }
}, { timestamps: true });

const Analysis = mongoose.models.Analysis || mongoose.model('Analysis', analysisSchema);
export default Analysis;`,

    Merchant: `import mongoose from 'mongoose';

const merchantSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true },
  category: String,
  tags: [String],
  verified: { type: Boolean, default: false }
}, { timestamps: true });

const Merchant = mongoose.models.Merchant || mongoose.model('Merchant', merchantSchema);
export default Merchant;`
  };

  if (modelTemplates[modelName]) {
    await fs.writeFile(`src/models/${modelName}.js`, modelTemplates[modelName]);
  }
}

// Step 6: Install dependencies
async function checkDependencies() {
  console.log('\n Step 6: Checking dependencies...');
  
  try {
    await fs.access('node_modules');
    console.log('   Dependencies installed');
  } catch {
    console.log('    Dependencies not installed');
    console.log('   Run: npm install');
  }
}

// Step 7: Database check
async function checkDatabase() {
  console.log('\n Step 7: Database connectivity...');
  console.log('  ℹ  Make sure MongoDB is running on localhost:27017');
  console.log('  ℹ  To start MongoDB: mongod --dbpath /path/to/data');
}

// Main setup function
async function setup() {
  try {
    await setupEnvironment();
    await cleanupModels();
    await fixImports();
    await createDirectories();
    await validateCoreFiles();
    await checkDependencies();
    await checkDatabase();

    console.log('\n Setup complete!\n');
    console.log('Next steps:');
    console.log('1. Update .env file with your actual values');
    console.log('2. Ensure MongoDB is running');
    console.log('3. Run: npm install (if needed)');
    console.log('4. Run: npm run dev');
    console.log('\nFor testing:');
    console.log('- Run: npm test');
    
  } catch (error) {
    console.error('\n Setup failed:', error.message);
    process.exit(1);
  }
}

// Run setup
setup();
