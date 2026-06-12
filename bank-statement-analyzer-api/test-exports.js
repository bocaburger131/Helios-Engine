import * as authModule from './src/middleware/auth.middleware.js';

console.log('✅ Auth module exports:');
console.log(Object.keys(authModule));
console.log('');
console.log('Detailed exports:');
for (const [key, value] of Object.entries(authModule)) {
  console.log(`${key}: ${typeof value}`);
}
