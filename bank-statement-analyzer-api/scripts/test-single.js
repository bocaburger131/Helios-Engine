#!/usr/bin/env node

import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

const testFile = process.argv[2];

if (!testFile) {
  console.log('Usage: npm run test:single <test-file>');
  process.exit(1);
}

async function runSingleTest() {
  console.log(`🧪 Running single test: ${testFile}
`);
  
  try {
    const { stdout, stderr } = await execAsync(`npx vitest run ${testFile}`);
    console.log(stdout);
    if (stderr) console.error(stderr);
  } catch (error) {
    console.error('Test failed:', error.message);
    process.exit(1);
  }
}

runSingleTest();
