import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

async function ensureDir(dir) {
  try {
    await fs.mkdir(dir, { recursive: true });
  } catch (error) {
    // Directory already exists
  }
}

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function createFileIfMissing(filePath, content) {
  if (await fileExists(filePath)) {
    console.log(`✅ ${path.relative(rootDir, filePath)} already exists`);
    return false;
  }
  
  await ensureDir(path.dirname(filePath));
  await fs.writeFile(filePath, content);
  console.log(`✨ Created ${path.relative(rootDir, filePath)}`);
  return true;
}

async function setupComplete() {
  console.log('🚀 Complete setup for Bank Statement Analyzer API\n');
  
  // Step 1: Create directory structure
  console.log('📁 Creating directory structure...');
  const dirs = [
    'src/config',
    'src/controllers',
    'src/middleware',
    'src/models',
    'src/routes',
    'src/services',
    'src/utils',
    'tests/unit',
    'tests/integration',
    'tests/helpers',
    'scripts'
  ];
  
  for (const dir of dirs) {
    await ensureDir(path.join(rootDir, dir));
  }
  
  // Step 2: Create essential configuration files
  console.log('\n⚙️  Creating configuration files...');
  
  // .env.test
  await createFileIfMissing(
    path.join(rootDir, '.env.test'),
    `NODE_ENV=test
PORT=5001
MONGODB_URI_TEST=mongodb://localhost:27017/bank-statement-test
JWT_SECRET=test-secret-key
PERPLEXITY_API_KEY=test-perplexity-key
API_KEY=test-api-key
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_MOCK=true
USE_REDIS=false
LOG_LEVEL=error`
  );
  
  // Step 3: Create all missing source files
  console.log('\n📝 Creating source files...');
  
  // Run the other setup scripts
  console.log('\n🔧 Running sub-setup scripts...');
  
  try {
    // Import and run each setup script
    const setupScripts = [
      './setup-missing-files.js',
      './check-routes-fixed.js'
    ];
    
    for (const script of setupScripts) {
      console.log(`\n▶️  Running ${script}...`);
      try {
        const scriptPath = path.join(__dirname, script);
        if (await fileExists(scriptPath)) {
          const module = await import(scriptPath);
          if (module.default && typeof module.default === 'function') {
            await module.default();
          }
        }
      } catch (error) {
        console.log(`⚠️  Could not run ${script}: ${error.message}`);
      }
    }
  } catch (error) {
    console.error('Error running setup scripts:', error);
  }
  
  console.log('\n✅ Complete setup finished!');
  console.log('\n📋 Next steps:');
  console.log('1. Run: npm install');
  console.log('2. Run: npm test');
  console.log('3. Fix any remaining test failures');
}

// Export for use in other scripts
export default setupComplete;

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  setupComplete().catch(console.error);
}