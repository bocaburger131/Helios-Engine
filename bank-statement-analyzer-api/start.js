#!/usr/bin/env node
import { spawn } from 'child_process';
import { promises as fs } from 'fs';

console.log(' Starting Bank Statement Analyzer API...\n');

// Pre-flight checks
async function preflightChecks() {
  const checks = [];
  
  // Check .env
  try {
    await fs.access('.env');
    checks.push(' .env file found');
  } catch {
    checks.push(' .env file missing - run: node setup-environment.js');
  }

  // Check node_modules
  try {
    await fs.access('node_modules');
    checks.push(' Dependencies installed');
  } catch {
    checks.push(' Dependencies missing - run: npm install');
  }

  // Check MongoDB connection
  const mongodb = process.env.MONGODB_URI || 'mongodb://localhost:27017/bank-analyzer';
  checks.push(`ℹ  MongoDB URI: ${mongodb}`);

  return checks;
}

async function start() {
  const checks = await preflightChecks();
  
  console.log('Pre-flight checks:');
  checks.forEach(check => console.log(`  ${check}`));
  console.log('');

  if (checks.some(c => c.includes(''))) {
    console.log('  Please fix the issues above before starting.');
    process.exit(1);
  }

  console.log('Starting server...\n');
  
  // Start the server with nodemon
  const server = spawn('npm', ['run', 'dev'], {
    stdio: 'inherit',
    shell: true
  });

  server.on('error', (err) => {
    console.error('Failed to start server:', err);
  });

  server.on('exit', (code) => {
    console.log(`Server exited with code ${code}`);
  });
}

start();

import('./src/app.js').catch(err => {
  console.error('Failed to start application:', err);
  process.exit(1);
});
