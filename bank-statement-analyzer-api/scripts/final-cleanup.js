// scripts/final-cleanup.js
import fs from 'fs/promises';
import path from 'path';
import { execSync } from 'child_process';
import { glob } from 'glob';

// --- Configuration ---
const OBSOLETE_FILES = [
  'tests/db-connection.test.js',
  'tests/simple.test.js',
  'tests/path-alias.test.js',
  'tests/alias', // The whole directory
  'test', // The whole directory
  'tests/setup-validation.test.js',
  'tests/setup-verification.test.js',
  'tests/basic.test.js',
  'tests/app.test.js', // Will be replaced by integration tests
  'tests/scripts/generateZohoCode.test.js', // Uses require()
  'tests/scripts/scripts', // Remove duplicated scripts directory
  'scripts/scripts' // Remove duplicated scripts directory
];

const REQUIRED_PACKAGES = ['csv-parser', 'prom-client'];

const hookRegex = /(beforeAll|afterAll)\s*\([\s\S]*?\}\);?/g;
const dbKeywords = ['mongoose.connect', 'MongoMemoryServer.create', 'global.connectDB', 'setupTestDatabase', 'disconnectDB'];

// --- Main Execution ---
async function run() {
  console.log('🚀 Starting final migration and cleanup script...');

  await installMissingDependencies();
  await deleteObsoleteFiles();
  await commentOutDbHooks();

  console.log('\n✅ Automated cleanup complete.');
  console.log('➡️ Please follow the manual steps in the Final Checklist to finish.');
}

async function installMissingDependencies() {
  console.log('\n🔍 Checking for missing dependencies...');
  try {
    const packageJson = JSON.parse(await fs.readFile('package.json', 'utf8'));
    const allDependencies = { ...packageJson.dependencies, ...packageJson.devDependencies };
    const missingPackages = REQUIRED_PACKAGES.filter(pkg => !allDependencies[pkg]);
    
    if (missingPackages.length > 0) {
      console.log(`  - Found missing packages: ${missingPackages.join(', ')}`);
      console.log('  - Running npm install...');
      execSync(`npm install ${missingPackages.join(' ')}`, { stdio: 'inherit' });
    } else {
      console.log('  - All required dependencies are installed.');
    }
  } catch (error) {
    console.error('❌ Error checking dependencies:', error);
  }
}

async function deleteObsoleteFiles() {
  console.log('\n🗑️ Deleting obsolete test files...');
  for (const fileOrDir of OBSOLETE_FILES) {
    try {
        const stats = await fs.stat(fileOrDir).catch(() => null);
        if (stats) {
            await fs.rm(fileOrDir, { recursive: true, force: true });
            console.log(`  - Deleted: ${fileOrDir}`);
        }
    } catch (e) { /* Ignore errors if file/dir doesn't exist */ }
  }
}

async function commentOutDbHooks() {
  console.log('\n📝 Commenting out redundant MongoDB connections...');
  const files = await glob('{src,tests}/**/*.test.js');
  let filesChanged = 0;

  for (const file of files) {
    try {
      let content = await fs.readFile(file, 'utf8');
      const originalContent = content;
      content = content.replace(hookRegex, (matchedBlock) => {
        const isDbHook = dbKeywords.some(keyword => matchedBlock.includes(keyword));
        if (isDbHook) {
          console.log(`  - Found database hook in: ${path.basename(file)}`);
          return `/* --- AUTOMATED CLEANUP ---\n${matchedBlock}\n*/`;
        }
        return matchedBlock;
      });
      if (originalContent !== content) {
        await fs.writeFile(file, content, 'utf8');
        filesChanged++;
      }
    } catch (error) { /* Ignore parse failures on already broken files */ }
  }
   console.log(`  - Commented out hooks in ${filesChanged} files.`);
}

// Run the script
run();
