// Final validation test for consolidation
console.log('🧪 Testing consolidated system...\n');

// Test 1: Auth middleware
import('./src/middleware/auth.middleware.js')
  .then(auth => {
    console.log('✅ Auth middleware: Success');
    console.log('   Functions:', Object.keys(auth).filter(k => typeof auth[k] === 'function'));
  })
  .catch(err => console.log('❌ Auth middleware failed:', err.message));

// Test 2: Statement routes  
import('./src/routes/statementRoutes.js')
  .then(routes => {
    console.log('✅ Statement routes: Success');
    console.log('   Router exported:', typeof routes.default === 'function');
  })
  .catch(err => console.log('❌ Statement routes failed:', err.message));

// Test 3: Index routes
import('./src/routes/index.js')
  .then(index => {
    console.log('✅ Index routes: Success');
    console.log('   Main router exported:', typeof index.default === 'function');
  })
  .catch(err => console.log('❌ Index routes failed:', err.message));

setTimeout(() => {
  console.log('\n🎉 Consolidation validation complete!');
  process.exit(0);
}, 1000);
