console.log(' Running pre-flight checks...\n');

import fs from 'fs';
import path from 'path';

const checks = {
  envFile: false,
  mongoUri: false,
  jwtSecret: false,
  requiredDirs: false,
  authMiddleware: false
};

// Check 1: .env file
if (fs.existsSync('.env')) {
  checks.envFile = true;
  const envContent = fs.readFileSync('.env', 'utf8');
  
  if (envContent.includes('MONGODB_URI=')) {
    checks.mongoUri = true;
  }
  
  if (envContent.includes('JWT_SECRET=')) {
    checks.jwtSecret = true;
  }
}

// Check 2: Required directories
const requiredDirs = ['src/routes', 'src/controllers', 'src/models', 'src/middleware'];
checks.requiredDirs = requiredDirs.every(dir => fs.existsSync(dir));

// Check 3: Auth middleware exists
checks.authMiddleware = fs.existsSync('src/middleware/authMiddleware.js');

// Display results
console.log(' Environment Checks:');
console.log(`   ${checks.envFile ? '' : ''} .env file exists`);
console.log(`   ${checks.mongoUri ? '' : ''} MongoDB URI configured`);
console.log(`   ${checks.jwtSecret ? '' : ''} JWT Secret configured`);
console.log(`   ${checks.requiredDirs ? '' : ''} Required directories exist`);
console.log(`   ${checks.authMiddleware ? '' : ''} Auth middleware exists`);

const allChecks = Object.values(checks).every(v => v);
if (allChecks) {
  console.log('\n All checks passed! Ready to start server.');
} else {
  console.log('\n Some checks failed. Please fix the issues above.');
}

process.exit(allChecks ? 0 : 1);
