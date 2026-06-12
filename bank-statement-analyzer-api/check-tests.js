// Quick test configuration checker
import { glob } from 'glob';
import fs from 'fs';

console.log('🔍 Checking test file patterns...\n');

// Check our actual test files
const testPatterns = [
  'test/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}',
  'tests/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}',
  'src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}',
  '*.test.js',
  'debug-*.test.js'
];

for (const pattern of testPatterns) {
  try {
    const files = await glob(pattern, { ignore: '**/node_modules/**' });
    console.log(`Pattern: ${pattern}`);
    console.log(`Files found: ${files.length}`);
    if (files.length > 0) {
      files.slice(0, 5).forEach(f => console.log(`  - ${f}`));
      if (files.length > 5) console.log(`  ... and ${files.length - 5} more`);
    }
    console.log('');
  } catch (err) {
    console.log(`Error with pattern ${pattern}:`, err.message);
  }
}

// Check vitest config
if (fs.existsSync('./vitest.config.js')) {
  console.log('✅ vitest.config.js exists');
} else {
  console.log('❌ vitest.config.js missing');
}

// Check setup file
if (fs.existsSync('./tests/vitest.setup.js')) {
  console.log('✅ vitest.setup.js exists');
} else {
  console.log('❌ vitest.setup.js missing');
}
