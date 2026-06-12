// Quick test to verify our model setup is working
import { beforeAll } from 'vitest';

// Load our test setup
import './tests/vitest.setup.js';

console.log('Testing model availability...');

// Wait a moment for setup to complete
setTimeout(() => {
  console.log('User model available:', typeof global.User);
  console.log('Statement model available:', typeof global.Statement);
  
  if (global.User) {
    console.log('User model has create method:', typeof global.User.create);
    console.log('User model has findOne method:', typeof global.User.findOne);
  }
  
  if (global.Statement) {
    console.log('Statement model has create method:', typeof global.Statement.create);
    console.log('Statement model has find method:', typeof global.Statement.find);
  }
  
  process.exit(0);
}, 1000);
