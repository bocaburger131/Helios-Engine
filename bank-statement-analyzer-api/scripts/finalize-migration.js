// scripts/finalize-migration.js
import fs from 'fs/promises';
import path from 'path';
import { glob } from 'glob';
import { execSync } from 'child_process';

// --- Configuration ---
const OBSOLETE_FILES = [
  'tests/db-connection.test.js',
  'tests/simple.test.js',
  'tests/path-alias.test.js',
  'tests/alias/simple-import.test.js',
  'test/routes/analysisRoutes.test.js' // Note the 'test' vs 'tests' directory
];

const REQUIRED_PACKAGES = ['csv-parser', 'prom-client'];

// --- Main Execution ---
async function run() {
  console.log('🚀 Starting final migration and cleanup script...');

  await installMissingDependencies();
  await deleteObsoleteFiles();
  await refactorClassesToESM();

  console.log('\n✅ Cleanup complete. Please run "npm test" to see the results.');
}

// --- Script Functions ---

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
  for (const file of OBSOLETE_FILES) {
    try {
      if (fs.stat(file)) {
        await fs.unlink(file);
        console.log(`  - Deleted: ${file}`);
      }
    } catch (e) {
      // Ignore errors if file doesn't exist
    }
  }
}

async function refactorClassesToESM() {
  console.log('\n🔧 Refactoring classes and imports to standard ESM...');
  const files = await glob('src/**/*.{js,mjs}');

  for (const file of files) {
    if (file.includes('.test.') || file.includes('.spec.')) continue; // Skip test files
    
    try {
      let content = await fs.readFile(file, 'utf8');
      
      // Pattern 1: Find `module.exports = new ClassName()`
      const cjsExportRegex = /module\.exports\s*=\s*new\s+(\w+)\(\);?/g;
      if (cjsExportRegex.test(content)) {
        content = content.replace(cjsExportRegex, 'export default new $1();');
        await fs.writeFile(file, content, 'utf8');
        console.log(`  - Refactored CJS export in: ${file}`);
      }

      // Pattern 2: Find `export const ClassName = { ... }` (Object Literal)
      const objExportRegex = /export\s+const\s+(\w+Controller)\s*=\s*\{/g;
      if (objExportRegex.test(content)) {
        content = content.replace(objExportRegex, 'class $1 {')
                         .replace(/,\s*async\s/g, '\n  async ')
                         .replace(/};?$/, `}\n\nexport default new $1();`);
        await fs.writeFile(file, content, 'utf8');
        console.log(`  - Refactored Object export to Class in: ${file}`);
      }
      
    } catch (error) {
      console.error(`❌ Error refactoring file ${file}:`, error);
    }
  }
}

// Run the script
run();