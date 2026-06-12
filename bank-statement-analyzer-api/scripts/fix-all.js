import { execSync } from 'child_process';

/**
 * Runs all fix scripts in sequence
 */
async function fixAll() {
  console.log('🔧 Running all fixes in sequence\n');
  
  const steps = [
    { name: 'Fix Controller Exports', command: 'npm run fix:controllers' },
    { name: 'Standardize Controller Methods', command: 'npm run standardize:controllers' },
    { name: 'Analyze Controllers', command: 'npm run analyze:controllers' },
    { name: 'Run Basic Tests', command: 'npm run test:basic' }
  ];
  
  for (const step of steps) {
    console.log(`\n📋 Step: ${step.name}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    try {
      // Run the command
      const output = execSync(step.command, { stdio: 'inherit' });
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log(`✅ ${step.name} completed successfully`);
    } catch (error) {
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log(`❌ ${step.name} failed`);
      console.log(`Error: ${error.message}`);
      process.exit(1);
    }
  }
  
  console.log('\n🎉 All fixes applied successfully!');
  console.log('Run npm run test:all to verify everything is working.');
}

fixAll().catch(console.error);