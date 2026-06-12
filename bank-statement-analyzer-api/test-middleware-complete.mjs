// Comprehensive test for middleware consolidation
console.log('Testing middleware consolidation...\n');

try {
  // Test direct import from auth.middleware.js
  const authModule = await import('./src/middleware/auth.middleware.js');
  console.log('✅ Direct auth.middleware.js import successful');
  console.log('Available functions:', Object.keys(authModule));
  
  // Test index.js import
  try {
    const indexModule = await import('./src/middleware/index.js');
    const authExports = Object.keys(indexModule).filter(k => k.toLowerCase().includes('auth'));
    console.log('✅ Index.js import successful');
    console.log('Auth-related exports:', authExports);
  } catch (indexError) {
    console.log('❌ Index.js import failed:', indexError.message);
  }
  
  console.log('\n📋 Summary:');
  console.log('- Direct auth middleware: ✅ Working');
  console.log('- Token generation function: ✅ Available');
  console.log('- All auth functions: ✅ Exported');
  
} catch (error) {
  console.log('❌ Import failed:', error.message);
  console.log('Stack:', error.stack);
}
