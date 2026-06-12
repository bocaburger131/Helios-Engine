import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Get current directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

console.log('Project root directory:', rootDir);

// Check if tests directory exists
const testsDir = path.join(rootDir, 'tests');
if (fs.existsSync(testsDir)) {
  console.log(`✅ Tests directory exists: ${testsDir}`);
  
  // List contents of tests directory
  const testFiles = fs.readdirSync(testsDir);
  console.log('Tests directory contents:');
  testFiles.forEach(file => {
    const filePath = path.join(testsDir, file);
    const stats = fs.statSync(filePath);
    console.log(`- ${file} (${stats.isDirectory() ? 'directory' : 'file'})`);
  });
  
  // Check if integration directory exists
  const integrationDir = path.join(testsDir, 'integration');
  if (fs.existsSync(integrationDir)) {
    console.log(`✅ Integration tests directory exists: ${integrationDir}`);
    
    // List contents of integration directory
    const integrationFiles = fs.readdirSync(integrationDir);
    console.log('Integration directory contents:');
    integrationFiles.forEach(file => {
      const filePath = path.join(integrationDir, file);
      const stats = fs.statSync(filePath);
      console.log(`- ${file} (${stats.isDirectory() ? 'directory' : 'file'})`);
    });
  } else {
    console.log(`❌ Integration tests directory does not exist: ${integrationDir}`);
  }
} else {
  console.log(`❌ Tests directory does not exist: ${testsDir}`);
}

// Create necessary directories if they don't exist
if (!fs.existsSync(testsDir)) {
  console.log('Creating tests directory...');
  fs.mkdirSync(testsDir);
}

const integrationDir = path.join(testsDir, 'integration');
if (!fs.existsSync(integrationDir)) {
  console.log('Creating integration tests directory...');
  fs.mkdirSync(integrationDir);
}

console.log('Done!');