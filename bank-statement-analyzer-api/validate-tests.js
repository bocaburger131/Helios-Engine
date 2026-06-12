#!/usr/bin/env node

// Simple test runner to validate our vitest configuration
console.log('🧪 Bank Statement Analyzer API - Test Runner');
console.log('===========================================\n');

import { execSync } from 'child_process';
import fs from 'fs';

try {
  // Check configuration files
  console.log('📋 Configuration Check:');
  console.log(`✅ vitest.config.js: ${fs.existsSync('./vitest.config.js') ? 'EXISTS' : 'MISSING'}`);
  console.log(`✅ tests/vitest.setup.js: ${fs.existsSync('./tests/vitest.setup.js') ? 'EXISTS' : 'MISSING'}`);
  console.log('');

  // Count test files (without running them)
  console.log('📊 Test Discovery:');
  const testDirs = ['test', 'tests', 'src'];
  let totalTests = 0;
  
  for (const dir of testDirs) {
    if (fs.existsSync(dir)) {
      const command = `Get-ChildItem -Path "${dir}" -Recurse -Include "*.test.js","*.spec.js" | Where-Object { $_.DirectoryName -notlike "*node_modules*" -and $_.Name -notlike "debug-*" } | Measure-Object | Select-Object -ExpandProperty Count`;
      try {
        const result = execSync(`powershell -Command "${command}"`, { encoding: 'utf8' }).trim();
        const count = parseInt(result) || 0;
        console.log(`${dir}/: ${count} test files`);
        totalTests += count;
      } catch (err) {
        console.log(`${dir}/: Error counting (${err.message})`);
      }
    } else {
      console.log(`${dir}/: Directory not found`);
    }
  }
  
  console.log(`\n📈 Total API Test Files: ${totalTests}`);
  console.log('🎯 Target: 20-40 API tests (excluding 100+ third-party tests)\n');

  // Run a quick vitest dry run
  console.log('🔍 Running Vitest Discovery (dry run):');
  try {
    const dryRun = execSync('npx vitest list --run', { encoding: 'utf8', timeout: 10000 });
    console.log('Discovery completed successfully');
    
    // Count lines that look like test files
    const testLines = dryRun.split('\n').filter(line => 
      line.includes('.test.js') || line.includes('.spec.js')
    );
    console.log(`📋 Vitest detected: ${testLines.length} test files\n`);
    
  } catch (err) {
    console.log(`⚠️  Vitest discovery error: ${err.message}\n`);
  }

  console.log('✅ Configuration validation complete!');
  console.log('🚀 To run tests: npx vitest run');
  
} catch (error) {
  console.error('❌ Validation failed:', error.message);
  process.exit(1);
}
