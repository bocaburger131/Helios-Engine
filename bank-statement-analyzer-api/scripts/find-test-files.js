import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';

// Get current directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

console.log('Current directory:', process.cwd());
console.log('Root directory:', rootDir);

// Function to recursively find test files
function findTestFiles(dir, fileList = []) {
  const files = fs.readdirSync(dir);
  
  files.forEach(file => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    
    if (stat.isDirectory() && !filePath.includes('node_modules') && !filePath.includes('dist')) {
      fileList = findTestFiles(filePath, fileList);
    } else if (
      file.endsWith('.test.js') || 
      file.endsWith('.spec.js') || 
      file.endsWith('.integration.test.js')
    ) {
      fileList.push(filePath);
    }
  });
  
  return fileList;
}

// Find all test files
const allTestFiles = findTestFiles(rootDir);
console.log('\nAll test files found:', allTestFiles.length);
allTestFiles.forEach(file => console.log(`- ${path.relative(rootDir, file)}`));

// Specifically check for integration tests
const integrationTests = allTestFiles.filter(file => 
  file.includes('/integration/') || file.includes('\\integration\\')
);
console.log('\nIntegration test files found:', integrationTests.length);
integrationTests.forEach(file => console.log(`- ${path.relative(rootDir, file)}`));

// Check if basic.integration.test.js exists
const basicTestPath = path.join(rootDir, 'tests', 'integration', 'basic.integration.test.js');
console.log(`\nDoes ${path.relative(rootDir, basicTestPath)} exist? ${fs.existsSync(basicTestPath)}`);

// Create directory structure if it doesn't exist
console.log('\nChecking and creating directory structure if needed...');
const testsDir = path.join(rootDir, 'tests');
const integrationDir = path.join(testsDir, 'integration');

if (!fs.existsSync(testsDir)) {
  console.log(`Creating tests directory: ${testsDir}`);
  fs.mkdirSync(testsDir);
}

if (!fs.existsSync(integrationDir)) {
  console.log(`Creating integration directory: ${integrationDir}`);
  fs.mkdirSync(integrationDir);
}

// Create a basic integration test file if it doesn't exist
if (!fs.existsSync(basicTestPath)) {
  console.log(`Creating basic integration test file: ${basicTestPath}`);
  
  const testContent = `import { describe, it, expect } from 'vitest';
import supertest from 'supertest';
import app from '../../src/app.js';

describe('Basic API Integration', () => {
  const request = supertest(app);

  it('should respond to health check endpoint', async () => {
    const response = await request.get('/health');
    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('status', 'ok');
  });

  it('should return welcome message on root route', async () => {
    const response = await request.get('/');
    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('message', 'Bank Statement Analyzer API');
  });
});`;

  fs.writeFileSync(basicTestPath, testContent);
}

console.log('\nDone!');