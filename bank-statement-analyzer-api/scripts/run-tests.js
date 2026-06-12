#!/usr/bin/env node

import { spawn } from 'child_process';
import { config } from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load test environment
config({ path: path.join(__dirname, '..', '.env.test') });

// Set environment variables for Windows
const env = {
  ...process.env,
  NODE_ENV: 'test',
  REDIS_MOCK: 'true',
  USE_REDIS: 'false',
  LOG_LEVEL: 'error'
};

console.log('🧪 Running tests with Redis mock...\n');

// Get command line arguments
const args = process.argv.slice(2);

// Run vitest
const vitest = spawn('npx', ['vitest', ...args], {
  env,
  stdio: 'inherit',
  shell: true
});

vitest.on('close', (code) => {
  process.exit(code);
});
