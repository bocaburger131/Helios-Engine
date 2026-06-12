// Quick test fix validation script
import { execSync } from 'child_process';

console.log('🔧 QUICK FIX VALIDATION');
console.log('========================\n');

const testTargets = [
  {
    name: 'RiskAnalysisService (Core Fix)',
    command: 'npx vitest run test/unit/riskAnalysisService.test.js --reporter verbose'
  },
  {
    name: 'Statement Routes (Route Fix)',
    command: 'npx vitest run tests/integration/statement.integration.test.js --reporter basic'
  },
  {
    name: 'Auth Middleware (Import Fix)',
    command: 'npx vitest run src/middleware/auth.middleware.test.js --reporter basic'
  },
  {
    name: 'Statement Model (Model Fix)', 
    command: 'npx vitest run tests/models/Statement.test.js --reporter basic'
  }
];

let successCount = 0;

for (const test of testTargets) {
  try {
    console.log(`🔄 Testing: ${test.name}...`);
    const output = execSync(test.command, { 
      encoding: 'utf8', 
      cwd: process.cwd(),
      stdio: 'pipe',
      timeout: 20000
    });
    
    if (output.includes('PASS') || output.includes('passed')) {
      console.log(`✅ ${test.name}: SUCCESS`);
      successCount++;
    } else {
      console.log(`⚠️  ${test.name}: COMPLETED (check details)`);
    }
    
  } catch (error) {
    console.log(`❌ ${test.name}: FAILED`);
    if (error.stdout) {
      const lines = error.stdout.split('\n');
      const errorLine = lines.find(line => line.includes('Error:') || line.includes('FAIL'));
      if (errorLine) {
        console.log(`   Error: ${errorLine.trim()}`);
      }
    }
  }
}

console.log('\n' + '='.repeat(40));
console.log(`📊 FIXES APPLIED: ${successCount}/${testTargets.length} tests passing`);

if (successCount === testTargets.length) {
  console.log('🎉 ALL CRITICAL FIXES SUCCESSFUL!');
  console.log('✅ Ready to run full test suite');
} else {
  console.log(`🔧 ${testTargets.length - successCount} issues remaining`);
  console.log('Continue with additional debugging...');
}
