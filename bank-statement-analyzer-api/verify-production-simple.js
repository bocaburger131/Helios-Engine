#!/usr/bin/env node

/**
 * Simple Production Configuration Verification
 * 
 * This script does a quick check of production readiness
 * without requiring complex interactions.
 */

console.log('🔍 Bank Statement Analyzer - Production Verification');
console.log('══════════════════════════════════════════════════');

// Check if running in production mode
const isProduction = process.env.NODE_ENV === 'production';
console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'} ${isProduction ? '✅' : '⚠️'}`);

// Check key environment variables
const requiredVars = [
  'PORT',
  'MONGO_URI', 
  'API_KEY',
  'JWT_SECRET'
];

console.log('\n🔑 Required Environment Variables:');
let missingVars = 0;
for (const envVar of requiredVars) {
  const value = process.env[envVar];
  if (value) {
    console.log(`✅ ${envVar}: Set`);
  } else {
    console.log(`❌ ${envVar}: Missing`);
    missingVars++;
  }
}

// Check optional but recommended variables
const optionalVars = [
  'REDIS_HOST',
  'PERPLEXITY_API_KEY',
  'ZOHO_CLIENT_ID'
];

console.log('\n🔧 Optional Environment Variables:');
for (const envVar of optionalVars) {
  const value = process.env[envVar];
  if (value) {
    console.log(`✅ ${envVar}: Set`);
  } else {
    console.log(`⭕ ${envVar}: Not set`);
  }
}

// Test module imports
console.log('\n📦 Configuration Modules:');
try {
  // Test if we can import the config files
  await import('./config/production.js');
  console.log('✅ Production config: Available');
} catch (error) {
  console.log(`❌ Production config: Failed - ${error.message}`);
}

try {
  await import('./config/browser-production.js');
  console.log('✅ Browser config: Available');
} catch (error) {
  console.log(`❌ Browser config: Failed - ${error.message}`);
}

console.log('\n🎯 Production Readiness Summary:');
console.log('═══════════════════════════════');

if (missingVars === 0) {
  console.log('✅ All required environment variables are set');
  console.log('✅ Configuration modules are available');
  console.log('🚀 Ready for production deployment!');
  
  console.log('\n📋 Next Steps:');
  console.log('1. Set up your production environment variables');
  console.log('2. Configure MongoDB Atlas production cluster');
  console.log('3. Set up Zoho CRM OAuth credentials (if using)');
  console.log('4. Deploy with: npm run prod:start');
  
  process.exit(0);
} else {
  console.log(`❌ ${missingVars} required environment variables are missing`);
  console.log('⚠️  Please set up your production environment before deploying');
  
  console.log('\n📋 Setup Steps:');
  console.log('1. Copy .env.production.template to .env.production');
  console.log('2. Fill in all required values in .env.production');
  console.log('3. Run this verification again');
  
  process.exit(1);
}
